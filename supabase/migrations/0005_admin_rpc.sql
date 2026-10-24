-- Admin RPCs (TRD.md › APIs › Admin). Every one checks is_admin(). Failures raise an UPPER_SNAKE code, so
-- nothing half-applies. Overrides need a reason and write admin_audit (SECURITY.md T13).

create function public._reason(p text) returns text
language plpgsql immutable as $$
begin
  if p is null or char_length(btrim(p)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  return btrim(p);
end $$;

-- Deletes the auth accounts of players (only accounts the join function created).
create function public._delete_player_users(p_user_ids uuid[]) returns void
language sql set search_path = public as $$
  delete from auth.users where id = any (p_user_ids) and email like '%@players.cryptohunt.app';
$$;

-- A member leaving mid-round: their unsolved piece is merged (unlocked) so the team can continue.
create function public._merge_member(p_player uuid) returns void
language plpgsql set search_path = public as $$
declare
  team uuid;
  r int;
begin
  select team_id into team from public.players where id = p_player;
  select round into r from public.team_state where team_id = team;
  if r is null then return; end if;
  update public.tasks set player_id = null, solved_at = coalesce(solved_at, now())
   where player_id = p_player and round = r;
  perform public._after_piece(team);
  perform public._check_team_in(team);
end $$;

-- ── Setup ───────────────────────────────────────────────────────────────────────────────────────────
create function public.create_teams(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  names text[] := array['Iron Gulls', 'Salt Wolves', 'Black Tide', 'Night Herons', 'Copper Owls', 'Rust Anchors',
    'Ember Crows', 'Grey Moths', 'Pale Foxes', 'Stone Eels', 'Brass Kites', 'Storm Petrels', 'Red Lanterns',
    'Tin Compasses', 'Amber Rays', 'Ghost Crabs', 'Jade Serpents', 'Sea Ravens', 'Dusk Otters', 'Gold Finches',
    'Iron Keels', 'Mist Walkers', 'Coral Knights', 'Wild Tides', 'Ash Herons', 'Cinder Sails', 'Frost Wolves',
    'Hollow Reefs', 'Moon Pikes', 'North Stars', 'Oak Barrels', 'Pearl Divers', 'Quiet Krakens', 'Rope Dancers',
    'Sable Fins', 'Velvet Hooks', 'Silver Eels', 'Thunder Gulls', 'Lantern Crew', 'Bone Compasses'];
  g public.games;
  start_n int;
  i int;
  nm text;
  created int := 0;
begin
  perform public._admin();
  if p_count is null or p_count < 1 or p_count > 60 then raise exception 'BAD_COUNT'; end if;
  select * into g from public.games where id = 1 for update;
  if g.status not in ('SETUP', 'REGISTRATION', 'READY') then raise exception 'GAME_STARTED'; end if;
  select coalesce(max(number), 0) into start_n from public.teams;
  for i in start_n + 1 .. start_n + p_count loop
    nm := coalesce(names[i], 'Crew ' || i);
    if exists (select 1 from public.teams where name = nm) then nm := 'Crew ' || i; end if;
    loop
      begin
        insert into public.teams (number, name, code) values (i, nm, public._random_code(6));
        exit;
      exception when unique_violation then
        null; -- code collision: draw again
      end;
    end loop;
    created := created + 1;
  end loop;
  update public.games set status = case when status = 'SETUP' then 'REGISTRATION' else status end,
                          registration_open = true where id = 1;
  perform public._audit('create_teams', null, null, jsonb_build_object('count', created));
  perform public._refresh_public();
  return (select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'name', name, 'code', code) order by number)
          from public.teams);
end $$;

create function public.rename_team(p_team uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update public.teams set name = btrim(p_name) where id = p_team;
  if not found then raise exception 'NO_TEAM'; end if;
  perform public._audit('rename_team', p_team::text, null, jsonb_build_object('name', p_name));
  perform public._refresh_public();
end $$;

create function public.delete_team(p_team uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare reason text := public._reason(p_reason);
begin
  perform public._admin();
  if (select status from public.games where id = 1) in ('RUNNING', 'PAUSED') then raise exception 'GAME_STARTED'; end if;
  perform public._delete_player_users(array(select user_id from public.players where team_id = p_team));
  delete from public.teams where id = p_team;
  if not found then raise exception 'NO_TEAM'; end if;
  perform public._audit('delete_team', p_team::text, reason);
  perform public._refresh_public();
end $$;

create function public.set_registration(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update public.games set registration_open = p_open where id = 1;
  perform public._audit('set_registration', null, null, jsonb_build_object('open', p_open));
  perform public._refresh_public();
end $$;

-- Re-validates the browser-built plan (SECURITY.md T12) and creates every token and key server-side.
create function public.apply_game_plan(p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  n_teams int;
  n_rounds int;
  bad text;
begin
  perform public._admin();
  select * into g from public.games where id = 1 for update;
  if g.status not in ('SETUP', 'REGISTRATION', 'READY') then raise exception 'GAME_STARTED'; end if;
  select count(*) into n_teams from public.teams;
  if n_teams = 0 then raise exception 'NO_TEAMS'; end if;

  drop table if exists _pr, _pq, _pl, _pa;
  create temp table _pr on commit drop as
    select * from jsonb_to_recordset(coalesce(p_plan -> 'rounds', '[]')) as x(number int, qr_count int, advance_count int, difficulty int);
  create temp table _pq on commit drop as
    select x.*, gen_random_uuid() as id
    from jsonb_to_recordset(coalesce(p_plan -> 'qrs', '[]')) as x(ref text, round int, kind text, location_id uuid);
  create temp table _pl on commit drop as
    select * from jsonb_to_recordset(coalesce(p_plan -> 'links', '[]')) as x("from" text, "to" text);
  create temp table _pa on commit drop as
    select * from jsonb_to_recordset(coalesce(p_plan -> 'assignments', '[]')) as x(team_id uuid, round int, qr text);
  select count(*) into n_rounds from _pr;

  bad := case
    -- Rounds: 1..R, strictly shrinking, one final QR, enough round-1 QRs, X never growing.
    when n_rounds = 0 then 'no rounds'
    when (select count(distinct number) from _pr where number between 1 and n_rounds) <> n_rounds then 'rounds must be numbered 1..R'
    when exists (select 1 from _pr a join _pr b on b.number = a.number + 1 where b.qr_count >= a.qr_count) then 'QR counts must shrink each round'
    when (select qr_count from _pr where number = n_rounds) <> 1 then 'the last round must have exactly 1 QR'
    when (select qr_count from _pr where number = 1) < n_teams then 'round 1 needs a QR per team'
    when exists (select 1 from _pr where advance_count is null or advance_count < 1 or difficulty not between 1 and 5) then 'bad X or difficulty'
    when exists (select 1 from _pr a join _pr b on b.number = a.number + 1 where b.advance_count > a.advance_count) then 'X cannot grow'
    when (select advance_count from _pr where number = 1) > n_teams then 'round 1 X exceeds the teams'
    -- QRs: unique refs, right kind per round, counts match, distinct existing locations.
    when (select count(distinct ref) from _pq) <> (select count(*) from _pq) or exists (select 1 from _pq where ref is null) then 'QR refs must be unique'
    when exists (select 1 from _pq where not (
           (kind = 'prank' and round is null)
        or (kind = 'target' and round between 1 and n_rounds - 1)
        or (kind = 'final' and round = n_rounds))) then 'QR kind does not match its round'
    when exists (select 1 from _pr r where r.qr_count <> (select count(*) from _pq q where q.round = r.number)) then 'QR count per round does not match'
    when exists (select 1 from _pq q where not exists (select 1 from public.locations l where l.id = q.location_id)) then 'unknown location'
    when (select count(distinct location_id) from _pq) <> (select count(*) from _pq) then 'two QRs share one location'
    -- Links: every target links once to a QR of the next round; every QR after round 1 is reachable.
    when exists (select 1 from _pl l left join _pq f on f.ref = l."from" left join _pq t on t.ref = l."to"
                 where f.ref is null or t.ref is null or f.kind <> 'target' or t.round <> f.round + 1) then 'links must join a QR to one in the next round'
    when (select count(*) from _pl) <> (select count(distinct "from") from _pl) then 'a QR links twice'
    when exists (select 1 from _pq q where q.kind = 'target' and not exists (select 1 from _pl l where l."from" = q.ref)) then 'dead end: a QR has no link'
    when exists (select 1 from _pq q where q.round > 1 and not exists (select 1 from _pl l where l."to" = q.ref)) then 'a QR can never be reached'
    -- Paths: every team exactly one QR per round, distinct starts, each step follows the links.
    when exists (select 1 from public.teams tm where (select count(distinct round) from _pa a where a.team_id = tm.id and a.round between 1 and n_rounds) <> n_rounds)
      or (select count(*) from _pa) <> n_teams * n_rounds then 'every team needs exactly one QR per round'
    when exists (select 1 from _pa a where not exists (select 1 from public.teams tm where tm.id = a.team_id)) then 'unknown team'
    when exists (select 1 from _pa a left join _pq q on q.ref = a.qr where q.ref is null or q.round <> a.round) then 'assignment QR is not in that round'
    when (select count(distinct qr) from _pa where round = 1) <> n_teams then 'two teams start on one QR'
    when exists (select 1 from _pa a join _pa b on b.team_id = a.team_id and b.round = a.round + 1
                 where not exists (select 1 from _pl l where l."from" = a.qr and l."to" = b.qr)) then 'a team path breaks'
    else null
  end;
  if bad is not null then raise exception 'BAD_PLAN: %', bad; end if;

  delete from public.assignments;
  delete from public.qr_links;
  delete from public.qr_codes where kind <> 'universal';
  delete from public.round_results;
  delete from public.rounds;

  insert into public.rounds (number, qr_count, advance_count, difficulty, is_final)
    select number, qr_count, advance_count, difficulty, number = n_rounds from _pr;
  insert into public.qr_codes (id, round, kind, location_id, token, key, label)
    select id, round, kind, location_id, public._token(), public._random_code(6), ref from _pq;
  insert into public.qr_links (from_qr, to_qr)
    select f.id, t.id from _pl l join _pq f on f.ref = l."from" join _pq t on t.ref = l."to";
  insert into public.assignments (team_id, round, qr_id)
    select a.team_id, a.round, q.id from _pa a join _pq q on q.ref = a.qr;
  update public.qr_codes c set is_spare = not exists (select 1 from public.assignments a where a.qr_id = c.id)
   where c.round = 1;
  if not exists (select 1 from public.qr_codes where kind = 'universal') then
    insert into public.qr_codes (kind, token, key, label) values ('universal', public._token(), public._random_code(6), 'U');
  end if;
  update public.games set status = 'READY' where id = 1;

  perform public._audit('apply_game_plan', null, null, jsonb_build_object('rounds', n_rounds,
    'qrs', (select count(*) from _pq where kind <> 'prank'), 'pranks', (select count(*) from _pq where kind = 'prank')));
  perform public._refresh_public();
  return jsonb_build_object('rounds', n_rounds, 'qrs', (select count(*) from public.qr_codes));
end $$;

-- ── Running the hunt ────────────────────────────────────────────────────────────────────────────────
create function public.start_game() returns void
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  n_rounds int;
  t record;
begin
  perform public._admin();
  select * into g from public.games where id = 1 for update;
  if g.status not in ('REGISTRATION', 'READY') then raise exception 'NOT_READY'; end if;
  select count(*) into n_rounds from public.rounds;
  if n_rounds = 0 then raise exception 'NO_PLAN'; end if;
  if not exists (select 1 from public.teams) then raise exception 'NO_TEAMS'; end if;
  if exists (select 1 from public.teams where status <> 'locked') then raise exception 'TEAMS_INCOMPLETE'; end if;
  if (select count(*) from public.questions where is_enabled) < 4 * n_rounds then raise exception 'NOT_ENOUGH_QUESTIONS'; end if;
  perform public._assign_paths();

  update public.games set status = 'RUNNING', started_at = now(), registration_open = false,
                          paused_at = null, finished_at = null, end_reason = null where id = 1;
  update public.teams set status = 'active' where status = 'locked';
  for t in select id from public.teams where status = 'active' loop
    insert into public.team_state (team_id, round, phase) values (t.id, 1, 'SOLVING');
    perform public._create_tasks(t.id, 1, false);
  end loop;
  perform public._event(null, null, 'game_started');
  perform public._audit('start_game', null, null);
  perform public._refresh_public();
end $$;

create function public.pause_game() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update public.games set status = 'PAUSED', paused_at = now() where id = 1 and status = 'RUNNING';
  if not found then raise exception 'NOT_RUNNING'; end if;
  perform public._event(null, null, 'paused');
  perform public._audit('pause_game', null, null);
  perform public._refresh_public();
end $$;

-- Penalty countdowns freeze while paused: they resume with the time that was left.
create function public.resume_game() returns void
language plpgsql security definer set search_path = public as $$
declare paused_for interval;
begin
  perform public._admin();
  select now() - paused_at into paused_for from public.games where id = 1 and status = 'PAUSED';
  if paused_for is null then raise exception 'NOT_PAUSED'; end if;
  update public.team_state set penalty_until = penalty_until + paused_for where phase = 'PENALTY';
  update public.scan_tickets set expires_at = expires_at + paused_for;
  update public.games set status = 'RUNNING', paused_at = null where id = 1;
  perform public._event(null, null, 'resumed');
  perform public._audit('resume_game', null, null);
  perform public._refresh_public();
end $$;

create function public.broadcast(p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  if char_length(coalesce(p_text, '')) > 200 then raise exception 'TOO_LONG'; end if;
  update public.games set broadcast = nullif(btrim(p_text), ''), broadcast_at = now() where id = 1;
  perform public._audit('broadcast', null, null, jsonb_build_object('text', p_text));
  perform public._refresh_public();
end $$;

create function public.set_hints(p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update public.games set hints_enabled = p_enabled where id = 1;
  perform public._audit('set_hints', null, null, jsonb_build_object('enabled', p_enabled));
  perform public._refresh_public();
end $$;

-- D-012: lowering X to (or below) the number already completed closes the round now.
create function public.set_advance_count(p_round int, p_x int) returns void
language plpgsql security definer set search_path = public as $$
declare rd public.rounds;
begin
  perform public._admin();
  if p_x is null or p_x < 1 then raise exception 'BAD_X'; end if;
  select * into rd from public.rounds where number = p_round for update;
  if not found then raise exception 'NO_ROUND'; end if;
  if rd.closed_at is not null then raise exception 'ROUND_CLOSED'; end if;
  update public.rounds set advance_count = p_x where number = p_round;
  if (select status from public.games where id = 1) in ('RUNNING', 'PAUSED')
     and (select count(*) from public.round_results where round = p_round) >= p_x then
    perform public._close_round(p_round);
    perform public._maybe_finish();
  end if;
  perform public._audit('set_advance_count', p_round::text, null, jsonb_build_object('x', p_x));
  perform public._refresh_public();
end $$;

create function public.end_game(p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update public.games set status = 'FINISHED', finished_at = now(), end_reason = coalesce(nullif(btrim(p_reason), ''), 'ended by admin')
   where id = 1 and status in ('RUNNING', 'PAUSED');
  if not found then raise exception 'NOT_RUNNING'; end if;
  delete from public.scan_tickets;
  perform public._event(null, null, 'game_ended', jsonb_build_object('reason', p_reason));
  perform public._audit('end_game', null, p_reason);
  perform public._refresh_public();
end $$;

-- ── Overrides (reason required, audited) ────────────────────────────────────────────────────────────
create function public.move_team(p_team uuid, p_round int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare reason text := public._reason(p_reason);
begin
  perform public._admin();
  if not exists (select 1 from public.teams where id = p_team and status = 'active') then raise exception 'TEAM_NOT_ACTIVE'; end if;
  if not exists (select 1 from public.rounds where number = p_round and closed_at is null) then raise exception 'NO_ROUND'; end if;
  delete from public.round_results where team_id = p_team and round >= p_round;
  delete from public.tasks where team_id = p_team and round >= p_round;
  delete from public.checkins where round >= p_round and player_id in (select id from public.players where team_id = p_team);
  perform public._start_round(p_team, p_round);
  perform public._audit('move_team', p_team::text, reason, jsonb_build_object('round', p_round));
  perform public._refresh_public();
end $$;

create function public.set_member_inactive(p_player uuid, p_inactive boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare reason text := public._reason(p_reason);
begin
  perform public._admin();
  update public.players set is_active = not p_inactive where id = p_player;
  if not found then raise exception 'NO_PLAYER'; end if;
  if p_inactive then perform public._merge_member(p_player); end if;
  perform public._audit('set_member_inactive', p_player::text, reason, jsonb_build_object('inactive', p_inactive));
  perform public._refresh_public();
end $$;

-- A damaged or stolen QR: point the team at another QR of its current round, then follow the links.
create function public.repoint_team(p_team uuid, p_qr uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  reason text := public._reason(p_reason);
  ts public.team_state;
  q uuid := p_qr;
  r int;
  n_rounds int;
begin
  perform public._admin();
  select * into ts from public.team_state where team_id = p_team for update;
  if not found then raise exception 'TEAM_NOT_ACTIVE'; end if;
  if not exists (select 1 from public.qr_codes where id = p_qr and round = ts.round) then raise exception 'QR_NOT_IN_ROUND'; end if;
  select count(*) into n_rounds from public.rounds;
  for r in ts.round .. n_rounds loop
    update public.assignments set qr_id = q where team_id = p_team and round = r;
    if r < n_rounds then select to_qr into q from public.qr_links where from_qr = q; end if;
  end loop;
  update public.qr_codes set is_spare = false where id = p_qr;
  delete from public.scan_tickets where player_id in (select id from public.players where team_id = p_team);
  delete from public.checkins where round = ts.round and player_id in (select id from public.players where team_id = p_team);
  if ts.phase = 'CHECKING_IN' then update public.team_state set phase = 'SEEKING' where team_id = p_team; end if;
  perform public._audit('repoint_team', p_team::text, reason, jsonb_build_object('qr', p_qr));
  perform public._refresh_public();
end $$;

create function public.kick_player(p_player uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  reason text := public._reason(p_reason);
  pl public.players;
begin
  perform public._admin();
  select * into pl from public.players where id = p_player;
  if not found then raise exception 'NO_PLAYER'; end if;
  update public.players set is_active = false where id = p_player;
  perform public._merge_member(p_player);
  delete from public.players where id = p_player;
  perform public._delete_player_users(array[pl.user_id]);
  update public.teams set status = 'forming' where id = pl.team_id and status = 'locked';
  perform public._alert(pl.team_id, null, 'kicked', jsonb_build_object('name', pl.name));
  perform public._audit('kick_player', p_player::text, reason, jsonb_build_object('name', pl.name));
  perform public._refresh_public();
end $$;

create function public.disqualify_team(p_team uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare reason text := public._reason(p_reason);
begin
  perform public._admin();
  update public.teams set status = 'disqualified' where id = p_team and status not in ('finished', 'disqualified');
  if not found then raise exception 'TEAM_NOT_ACTIVE'; end if;
  update public.team_state set phase = 'ELIMINATED', updated_at = now() where team_id = p_team;
  delete from public.scan_tickets where player_id in (select id from public.players where team_id = p_team);
  perform public._maybe_finish();
  perform public._audit('disqualify_team', p_team::text, reason);
  perform public._refresh_public();
end $$;

create function public.force_complete(p_team uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  reason text := public._reason(p_reason);
  res jsonb;
begin
  perform public._admin();
  if not exists (select 1 from public.teams where id = p_team and status = 'active') then raise exception 'TEAM_NOT_ACTIVE'; end if;
  res := public._complete_round(p_team);
  perform public._audit('force_complete', p_team::text, reason, res);
  perform public._refresh_public();
  return res;
end $$;

create function public.ack_alert(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update public.alerts set acknowledged = true where id = p_id;
end $$;

create function public.export_results() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  return jsonb_build_object(
    'game', (select row_to_json(g) from public.games g where id = 1),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('number', t.number, 'name', t.name, 'status', t.status,
        'final_rank', t.final_rank, 'eliminated_in_round', t.eliminated_in_round,
        'members', (select coalesce(jsonb_agg(p.name order by p.created_at), '[]') from public.players p where p.team_id = t.id),
        'rounds', (select coalesce(jsonb_agg(jsonb_build_object('round', r.round, 'completed_at', r.completed_at,
                     'order', r.completion_order) order by r.round), '[]') from public.round_results r where r.team_id = t.id)
      ) order by t.number) from public.teams t), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'team', t.name, 'kind', e.kind, 'data', e.data) order by e.at)
      from public.events e left join public.teams t on t.id = e.team_id), '[]'),
    'audit', coalesce((select jsonb_agg(row_to_json(a) order by a.at) from public.admin_audit a), '[]'));
end $$;

-- New game (D-020): everyone logged out; players, progress and logs deleted; team codes regenerated.
-- The printed QR sheet is kept unless p_regenerate_qr (then it must be reprinted). Venue and questions kept.
create function public.start_new_game(p_confirm text, p_regenerate_qr boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  perform public._admin();
  if p_confirm is distinct from 'NEW GAME' then raise exception 'CONFIRM_REQUIRED'; end if;
  perform public._delete_player_users(array(select user_id from public.players));
  delete from public.scan_tickets;
  delete from public.checkins;
  delete from public.tasks;
  delete from public.round_results;
  delete from public.team_state;
  delete from public.players;
  delete from public.assignments;
  delete from public.events;
  delete from public.alerts;
  delete from public.rate_limits;
  update public.rounds set closed_at = null;
  for t in select id from public.teams loop
    loop
      begin
        update public.teams set code = public._random_code(6), status = 'forming', eliminated_in_round = null,
          final_rank = null, completion_key = null, final_code = null, eliminated_view = null where id = t.id;
        exit;
      exception when unique_violation then
        null; -- code collision: draw again
      end;
    end loop;
  end loop;
  if p_regenerate_qr then
    update public.qr_codes set token = public._token(), key = public._random_code(6);
  end if;
  update public.qr_codes set is_spare = false where round = 1;
  update public.games set status = case when exists (select 1 from public.teams) then 'REGISTRATION' else 'SETUP' end,
    registration_open = exists (select 1 from public.teams), hints_enabled = false, paused_at = null,
    broadcast = null, broadcast_at = null, started_at = null, finished_at = null, end_reason = null where id = 1;
  perform public._audit('start_new_game', null, null, jsonb_build_object('regenerate_qr', p_regenerate_qr));
  perform public._refresh_public();
end $$;

grant execute on function
  public.create_teams(int), public.rename_team(uuid, text), public.delete_team(uuid, text),
  public.set_registration(boolean), public.apply_game_plan(jsonb), public.start_game(), public.pause_game(),
  public.resume_game(), public.broadcast(text), public.set_hints(boolean), public.set_advance_count(int, int),
  public.end_game(text), public.move_team(uuid, int, text), public.set_member_inactive(uuid, boolean, text),
  public.repoint_team(uuid, uuid, text), public.kick_player(uuid, text), public.disqualify_team(uuid, text),
  public.force_complete(uuid, text), public.ack_alert(bigint), public.export_results(),
  public.start_new_game(text, boolean)
to authenticated;

-- ── Realtime (T-208) ────────────────────────────────────────────────────────────────────────────────
-- Players: own team_state row (RLS) + public_state. Admin: everything below through admin_read.
alter publication supabase_realtime add table
  public.public_state, public.team_state, public.events, public.alerts, public.teams, public.players, public.round_results;
