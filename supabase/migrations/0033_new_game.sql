-- P11 (T-1101 … T-1106): the rerun's game. One phone per crew; Start Hunt shows the first question; one question then
-- one riddle per round; a single check-in by QR or the code on the card; places rotate between buildings (locations.area).

-- ── Join: one phone, the lead plus 3 names (T-1101) ──────────────────────────────────────────────────
alter table public.teams add column members text[] not null default '{}';

create or replace function public._players_max_four() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.players where team_id = new.team_id) then raise exception 'TEAM_FULL'; end if;
  return new;
end $$;

create or replace function public.join_preflight(p_name text, p_code text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  t public.teams;
  existing uuid;
  members int;
begin
  if public._hit('ip:' || coalesce(p_ip, '?'), 'join', 60) > 600 then return public._fail('RATE_LIMITED'); end if;
  if p_name is null or btrim(p_name) !~ '^[[:alnum:] .''_-]{2,40}$' then return public._fail('BAD_NAME'); end if;
  select * into g from public.games where id = 1;
  if g.status = 'FINISHED' then return public._fail('REGISTRATION_CLOSED'); end if;
  select * into t from public.teams where code = upper(btrim(coalesce(p_code, '')));
  if not found then return public._fail('BAD_CODE'); end if;
  if t.status in ('eliminated', 'disqualified', 'finished') then return public._fail('TEAM_LOCKED'); end if;
  -- Same name in the same team: this member is moving to a new phone (T11, alerted on commit).
  select user_id into existing from public.players where team_id = t.id and lower(btrim(name)) = lower(btrim(p_name));
  if existing is not null then
    return jsonb_build_object('ok', true, 'user_id', existing, 'takeover', true);
  end if;
  if not g.registration_open then return public._fail('REGISTRATION_CLOSED'); end if;
  select count(*) into members from public.players where team_id = t.id;
  if t.status <> 'forming' or members >= 1 then return public._fail('TEAM_FULL'); end if;
  return jsonb_build_object('ok', true, 'user_id', null, 'takeover', false);
end $$;

create or replace function public.join_commit(p_user_id uuid, p_name text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  t public.teams;
  p public.players;
  members int;
  nonce text := public._token();
begin
  select * into g from public.games where id = 1;
  select * into t from public.teams where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then return public._fail('BAD_CODE'); end if;
  select * into p from public.players where team_id = t.id and lower(btrim(name)) = lower(btrim(p_name));
  if found then
    if p.user_id <> p_user_id then return public._fail('NAME_TAKEN'); end if;
    update public.players set claim_nonce = nonce, claim_expires_at = now() + interval '10 minutes' where id = p.id;
    perform public._alert(t.id, p.id, 'session_moved', jsonb_build_object('name', p.name));
  else
    if not g.registration_open or g.status = 'FINISHED' then return public._fail('REGISTRATION_CLOSED'); end if;
    select count(*) into members from public.players where team_id = t.id;
    if t.status <> 'forming' or members >= 1 then return public._fail('TEAM_FULL'); end if;
    insert into public.players (team_id, user_id, name, claim_nonce, claim_expires_at)
    values (t.id, p_user_id, btrim(p_name), nonce, now() + interval '10 minutes')
    returning * into p;
    update public.teams set status = 'locked' where id = t.id;
    perform public._event(t.id, p.id, 'joined', jsonb_build_object('name', p.name, 'members', members + 1));
    perform public._refresh_public();
  end if;
  return jsonb_build_object('ok', true, 'claim_nonce', nonce,
    'team', jsonb_build_object('name', t.name, 'number', t.number), 'player_id', p.id);
end $$;

-- The lead's crew form: team name and the 3 teammates, until the game starts.
drop function public.name_crew(text);
create function public.setup_crew(p_name text, p_members text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  n text;
  m text[];
  x text;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status in ('RUNNING', 'PAUSED', 'FINISHED') then return public._fail('GAME_STARTED'); end if;
  if public._hit('p:' || p.id, 'setup_crew', 60) > 10 then return public._fail('RATE_LIMITED'); end if;
  n := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if n !~ '^[A-Za-z0-9][A-Za-z0-9 ''&.-]{1,23}$' then return public._fail('BAD_CREW_NAME'); end if;
  if lower(n) ~ '^crew [0-9]+$' then return public._fail('BAD_CREW_NAME'); end if;
  if cardinality(p_members) is distinct from 3 then return public._fail('BAD_MEMBERS'); end if;
  foreach x in array p_members loop
    x := btrim(regexp_replace(coalesce(x, ''), '\s+', ' ', 'g'));
    if x !~ '^[[:alnum:] .''_-]{2,40}$' then return public._fail('BAD_MEMBERS'); end if;
    m := m || x;
  end loop;
  if exists (select 1 from public.teams o where lower(o.name) = lower(n) and o.id <> p.team_id) then
    return public._fail('CREW_NAME_TAKEN');
  end if;
  update public.teams set name = n, named = true, members = m where id = p.team_id;
  perform public._event(p.team_id, p.id, 'crew_named', jsonb_build_object('name', n, 'members', m));
  return jsonb_build_object('ok', true, 'name', n);
end $$;
revoke execute on function public.setup_crew(text, text[]) from public, anon;
grant execute on function public.setup_crew(text, text[]) to authenticated;

-- Crews are Crew 1, Crew 2… until the lead names them; a crew can be as large as the admin needs.
create or replace function public.create_teams(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  start_n int;
  i int;
  created int := 0;
begin
  perform public._admin();
  if p_count is null or p_count < 1 or p_count > 200 then raise exception 'BAD_COUNT'; end if;
  select * into g from public.games where id = 1 for update;
  if g.status not in ('SETUP', 'REGISTRATION', 'READY') then raise exception 'GAME_STARTED'; end if;
  select coalesce(max(number), 0) into start_n from public.teams;
  for i in start_n + 1 .. start_n + p_count loop
    loop
      begin
        insert into public.teams (number, name, code) values (i, 'Crew ' || i, public._random_code(6));
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

create or replace function public.set_team_count(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  have int;
  empty int;
  removed int := 0;
  t record;
begin
  perform public._admin();
  if p_count is null or p_count < 0 or p_count > 200 then raise exception 'BAD_COUNT'; end if;
  if (select status from public.games where id = 1) not in ('SETUP', 'REGISTRATION', 'READY') then
    raise exception 'GAME_STARTED';
  end if;
  select count(*) into have from public.teams;
  if p_count > have then
    perform public.create_teams(p_count - have);
  elsif p_count < have then
    -- Only crews nobody has joined yet can go; a crew with players is removed from its own card (with a reason).
    select count(*) into empty from public.teams tm where not exists (select 1 from public.players p where p.team_id = tm.id);
    if have - p_count > empty then raise exception 'CREWS_HAVE_PLAYERS'; end if;
    for t in select tm.id from public.teams tm
              where not exists (select 1 from public.players p where p.team_id = tm.id)
              order by tm.number desc limit have - p_count loop
      delete from public.teams where id = t.id;
      removed := removed + 1;
    end loop;
    if p_count = 0 then update public.games set status = 'SETUP', registration_open = false where id = 1; end if;
    perform public._audit('set_team_count', null, null, jsonb_build_object('count', p_count, 'removed', removed));
    perform public._refresh_public();
  end if;
  return jsonb_build_object('before', have, 'after', (select count(*) from public.teams));
end $$;

-- ── Start Hunt, one question, one riddle (T-1102, T-1103) ────────────────────────────────────────────
create or replace function public._create_tasks(p_team uuid, p_round int, p_opened boolean) returns void
language plpgsql set search_path = public as $$
declare
  lead uuid;
  q uuid;
begin
  select id into lead from public.players where team_id = p_team order by is_active desc, created_at limit 1;
  q := public._pick_question(p_team, (select difficulty from public.rounds where number = p_round));
  if q is null then raise exception 'NOT_ENOUGH_QUESTIONS'; end if;
  insert into public.tasks (team_id, player_id, round, question_id, piece_index, opened_at, option_order)
  values (p_team, lead, p_round, q, 0, now(), public._option_order(q));
end $$;

create or replace function public.start_game() returns void
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
  if (select count(*) from public.questions where is_enabled) < n_rounds then raise exception 'NOT_ENOUGH_QUESTIONS'; end if;
  perform public._assign_paths();

  update public.games set status = 'RUNNING', started_at = now(), registration_open = false,
                          paused_at = null, finished_at = null, end_reason = null where id = 1;
  update public.teams set status = 'active' where status = 'locked';
  for t in select id from public.teams where status = 'active' loop
    insert into public.team_state (team_id, round, phase) values (t.id, 1, 'SOLVING');
    perform public._create_tasks(t.id, 1, true);
  end loop;
  perform public._event(null, null, 'game_started');
  perform public._audit('start_game', null, null);
  perform public._refresh_public();
end $$;

create or replace function public._after_piece(p_team uuid) returns int
language plpgsql set search_path = public as $$
declare ts public.team_state;
begin
  select * into ts from public.team_state where team_id = p_team for update;
  if ts.phase <> 'SOLVING' then return 1; end if;
  update public.team_state set phase = 'SEEKING', updated_at = now() where team_id = p_team;
  if (select is_final from public.rounds where number = ts.round) then
    loop
      begin
        update public.teams set final_code = public._random_code(6) where id = p_team and final_code is null;
        exit;
      exception when unique_violation then
        null; -- astronomically rare; draw again
      end;
    end loop;
  end if;
  perform public._event(p_team, null, 'clue_complete', jsonb_build_object('round', ts.round));
  return 1;
end $$;

-- A riddle is one text. Older sets (4 pieces) still read, joined.
alter table public.clue_sets add column riddle text check (char_length(riddle) <= 1000);
alter table public.clue_sets alter column pieces set default array['', '', '', '']::text[];
create or replace function public._pick_clue_set() returns trigger
language plpgsql set search_path = public as $$
declare
  loc uuid;
  sets int[];
  base int;
  k int;
begin
  select location_id into loc from public.qr_codes where id = new.qr_id;
  select array_agg(set_no order by set_no) into sets from public.clue_sets
   where location_id = loc and (btrim(coalesce(riddle, '')) <> '' or not exists (select 1 from unnest(pieces) p where btrim(p) = ''));
  if sets is null then
    select array_agg(set_no order by set_no) into sets from public.clue_sets where location_id = loc;
  end if;
  if sets is null then
    new.clue_set := null;
    return new;
  end if;
  select count(*) into base from public.admin_audit where action = 'start_new_game';
  select count(*) into k from public.assignments
   where qr_id = new.qr_id and round = new.round and team_id <> new.team_id;
  new.clue_set := sets[((base + k) % cardinality(sets)) + 1];
  return new;
end $$;

create or replace function public.my_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  t public.teams;
  ts public.team_state;
  rd public.rounds;
  my public.tasks;
  q public.questions;
  target public.locations;
  pieces_solved int;
  total_rounds int;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  select * into t from public.teams where id = p.team_id;
  select * into ts from public.team_state where team_id = t.id;
  select count(*) into total_rounds from public.rounds;
  if ts.team_id is not null then
    select * into rd from public.rounds where number = ts.round;
    select * into my from public.tasks where player_id = p.id and round = ts.round;
    if my.id is not null then select * into q from public.questions where id = my.question_id; end if;
    select count(*) into pieces_solved from public.tasks where team_id = t.id and round = ts.round and solved_at is not null;
    if pieces_solved >= 1 then
      select l.* into target from public.assignments a join public.qr_codes c on c.id = a.qr_id
        join public.locations l on l.id = c.location_id
       where a.team_id = t.id and a.round = ts.round;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'player', jsonb_build_object('id', p.id, 'name', p.name, 'is_active', p.is_active),
    'team', jsonb_build_object('id', t.id, 'number', t.number, 'name', t.name, 'status', t.status,
      'code', t.code, 'crew', t.members, 'final_rank', t.final_rank, 'eliminated_in_round', t.eliminated_in_round, 'eliminated_view', t.eliminated_view,
      'completion_key', case when t.status = 'finished' then t.completion_key end,
      'named', t.named,
      'can_name', not t.named and g.status not in ('RUNNING', 'PAUSED', 'FINISHED')
        and p.id = (select f.id from public.players f where f.team_id = t.id and f.is_active
                     order by f.created_at, f.id limit 1)),
    'game', jsonb_build_object('status', g.status, 'hints_enabled', g.hints_enabled,
      'broadcast', g.broadcast, 'broadcast_at', g.broadcast_at, 'hint_penalty_ms', g.hint_penalty_ms,
      'wrong_penalty_ms', g.wrong_penalty_ms),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'is_active', m.is_active, 'me', m.id = p.id,
        'solved', exists (select 1 from public.tasks x where x.player_id = m.id and x.round = ts.round and x.solved_at is not null),
        'checked_in', exists (select 1 from public.checkins c where c.player_id = m.id and c.round = ts.round and c.key_ok_at is not null)
      ) order by m.created_at) from public.players m where m.team_id = t.id), '[]'),
    'round', case when ts.team_id is null then null else jsonb_build_object(
      'number', ts.round, 'total', total_rounds, 'is_final', rd.is_final, 'difficulty', rd.difficulty) end,
    'phase', ts.phase,
    'penalty', case when ts.team_id is null then null else jsonb_build_object(
      'ms', ts.penalty_ms, 'until', ts.penalty_until) end,
    -- Own task only, never its answer.
    'task', case when my.id is null then null else jsonb_build_object(
      'id', my.id, 'opened', my.opened_at is not null, 'solved', my.solved_at is not null,
      'hint_used', my.hint_used,
      'text', case when my.opened_at is not null then q.text end,
      'format', case when my.opened_at is not null then q.format end,
      'options', case when my.opened_at is not null and q.format = 'mcq' then
        (select jsonb_agg(q.options -> o order by i) from unnest(my.option_order) with ordinality as x(o, i)) end,
      'hint', case when my.hint_used and q.format <> 'mcq' then q.hint end,
      'category', case when my.opened_at is not null then q.category end,
      'difficulty', q.difficulty,
      'piece_index', my.piece_index,
      'strikes', my.strikes,
      'has_hint', q.hint is not null and q.format <> 'mcq') end,
    'pieces', coalesce((select jsonb_agg(jsonb_build_object(
        'index', x.piece_index, 'solved', x.solved_at is not null,
        'by', (select m.name from public.players m where m.id = x.player_id), 'mine', x.player_id = p.id, 'hint', x.hint_used,
        'text', case when x.solved_at is not null then
          -- D-033: the clue set drawn for this crew at this mark (T-507).
          (select coalesce(cs.riddle, array_to_string(cs.pieces, E'\n')) from public.assignments a
             join public.qr_codes c on c.id = a.qr_id
             join public.clue_sets cs on cs.location_id = c.location_id and cs.set_no = a.clue_set
            where a.team_id = t.id and a.round = ts.round) end
      ) order by x.piece_index) from public.tasks x where x.team_id = t.id and x.round = ts.round), '[]'),
    -- Fog lifts over the region only (never the exact pin) once all four pieces are solved.
    'region', case when target.id is not null and target.map_x is not null then jsonb_build_object(
      -- Offset the circle from the pin by a fixed amount per team and round, so it stays put between refreshes.
      'x', round((target.map_x + (get_byte(decode(md5(t.id::text || ts.round || 'x'), 'hex'), 0) / 255.0 - 0.5)
                  * target.reveal_radius * 0.6)::numeric, 3),
      'y', round((target.map_y + (get_byte(decode(md5(t.id::text || ts.round || 'y'), 'hex'), 0) / 255.0 - 0.5)
                  * target.reveal_radius * 0.6)::numeric, 3),
      'r', target.reveal_radius) end,
    -- T-602: the regions of rounds already done stay lifted (same offset as when they were live).
    'visited', coalesce((select jsonb_agg(jsonb_build_object(
        'x', round((l.map_x + (get_byte(decode(md5(t.id::text || a.round || 'x'), 'hex'), 0) / 255.0 - 0.5)
                    * l.reveal_radius * 0.6)::numeric, 3),
        'y', round((l.map_y + (get_byte(decode(md5(t.id::text || a.round || 'y'), 'hex'), 0) / 255.0 - 0.5)
                    * l.reveal_radius * 0.6)::numeric, 3),
        'r', l.reveal_radius) order by a.round)
      from public.assignments a join public.qr_codes c on c.id = a.qr_id join public.locations l on l.id = c.location_id
      where a.team_id = t.id and a.round < ts.round and l.map_x is not null), '[]'),
    -- T-601: the venue map image (it has no pins; anyone may load it, D-034).
    'map', (select jsonb_build_object('path', v.image_path, 'w', v.width, 'h', v.height)
              from public.venue_map v where v.id = 1 and v.image_path is not null),
    -- D-026: the crew seal code, only in the final round once the final clue is complete.
    'seal_code', case when rd.is_final and pieces_solved >= 1 then t.final_code end
  );
end $$;

-- ── One check-in: QR or typed code (T-1104) ──────────────────────────────────────────────────────────
create function public.check_in(p_code text, p_seal_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  t public.teams;
  ts public.team_state;
  q public.qr_codes;
  own boolean;
  n int;
  code text := btrim(coalesce(p_code, ''));
  thief uuid;
  res jsonb;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status = 'PAUSED' then return public._fail('PAUSED'); end if;
  if g.status <> 'RUNNING' then return public._fail('NOT_RUNNING'); end if;
  select * into t from public.teams where id = p.team_id;
  if t.status in ('eliminated', 'disqualified') then return public._fail('ELIMINATED'); end if;
  if t.status = 'finished' then return public._fail('FINISHED'); end if;
  if not p.is_active then return public._fail('INACTIVE'); end if;
  n := public._hit('p:' || p.id, 'check_in', 60);
  if n > 20 then
    if n = 21 then perform public._alert(t.id, p.id, 'key_spam', '{}'); end if;
    return public._fail('RATE_LIMITED');
  end if;

  perform public._settle_penalties();
  select * into ts from public.team_state where team_id = t.id;
  select * into q from public.qr_codes
   where kind in ('target', 'final') and (token = code or key = upper(code)) limit 1;
  if not found then
    if exists (select 1 from public.cards where token = code or key = upper(code)) then
      return public._fail('UNUSED_MARK');
    end if;
    perform public._event(t.id, p.id, 'bad_qr');
    if public._hit('p:' || p.id, 'bad_qr', 600) = 5 then perform public._alert(t.id, p.id, 'bad_qr', '{}'); end if;
    return public._fail('BAD_QR');
  end if;

  if q.round < ts.round then return public._fail('ALREADY_DONE'); end if;
  own := exists (select 1 from public.assignments a where a.team_id = t.id and a.round = q.round and a.qr_id = q.id);
  if q.round > ts.round then
    update public.team_state set locked_scans = locked_scans + 1 where team_id = t.id returning locked_scans into n;
    perform public._alert(t.id, p.id, 'locked_scan', jsonb_build_object(
      'qr', q.label, 'qr_round', q.round, 'team_round', ts.round, 'own_future', own));
    if n = 3 then
      perform public._alert(t.id, p.id, 'possible_sweep', jsonb_build_object('round', ts.round, 'count', n));
    end if;
    return public._fail('LOCKED_MARK', jsonb_build_object('round', ts.round));
  end if;
  if not own then
    perform public._alert(t.id, p.id, 'wrong_team', jsonb_build_object('qr', q.label, 'round', q.round, 'spare', q.is_spare));
    return public._fail('NOT_YOURS');
  end if;
  if ts.phase = 'SOLVING' then return public._fail('SOLVE_FIRST'); end if;
  if ts.phase <> 'SEEKING' then return public._fail('ALREADY_DONE'); end if;

  if q.kind = 'final' then
    if btrim(coalesce(p_seal_code, '')) = '' then return public._fail('ASK_SEAL'); end if;
    if not public._key_eq(t.final_code, p_seal_code) then
      select id into thief from public.teams where id <> t.id and public._key_eq(final_code, p_seal_code);
      if thief is not null then
        perform public._alert(t.id, p.id, 'foreign_seal', jsonb_build_object('code_of_team',
          (select name from public.teams where id = thief)));
      end if;
      return public._fail('BAD_SEAL');
    end if;
  end if;

  insert into public.checkins (player_id, round, qr_id, key_ok_at, seal_ok_at)
  values (p.id, ts.round, q.id, now(), case when q.kind = 'final' then now() end)
  on conflict (player_id, round) do nothing;
  perform public._event(t.id, p.id, 'checked_in', jsonb_build_object('qr', q.label, 'round', ts.round));

  if ts.penalty_ms > 0 then
    update public.team_state
       set phase = 'PENALTY', penalty_until = now() + make_interval(secs => ts.penalty_ms / 1000.0), updated_at = now()
     where team_id = t.id and phase = 'SEEKING' and round = ts.round
     returning penalty_until into ts.penalty_until;
    perform public._event(t.id, null, 'penalty_started', jsonb_build_object('ms', ts.penalty_ms));
    return jsonb_build_object('ok', true, 'phase', 'PENALTY', 'until', ts.penalty_until);
  end if;
  res := public._complete_round(t.id, null, 'SEEKING');
  return jsonb_build_object('ok', true, 'phase', case when (res ->> 'eliminated')::boolean then 'ELIMINATED' else 'COMPLETED' end,
    'round', res -> 'round', 'order', res -> 'order', 'final', res -> 'final');
end $$;
revoke execute on function public.check_in(text, text) from public, anon;
grant execute on function public.check_in(text, text) to authenticated;

drop function public.scan_qr(text);
drop function public.submit_key(text, text, text);
drop function public._submit_key_body(text, text, text);

-- ── Generated courses: no universal card, no pranks; shared starts even per building (T-1105) ────────
create or replace function public.apply_game_plan(p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  n_teams int;
  n_rounds int;
  bad text;
  new_cards int;
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
    -- Rounds: 1..R, strictly shrinking, one final QR, X never growing.
    when n_rounds = 0 then 'no rounds'
    when (select count(distinct number) from _pr where number between 1 and n_rounds) <> n_rounds then 'rounds must be numbered 1..R'
    when exists (select 1 from _pr a join _pr b on b.number = a.number + 1 where b.qr_count >= a.qr_count) then 'QR counts must shrink each round'
    when (select qr_count from _pr where number = n_rounds) <> 1 then 'the last round must have exactly 1 QR'
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
    -- Paths: every team exactly one QR per round, each step follows the links. Starts are even per building, so a
    -- building with fewer cards carries a few more crews on each.
    when exists (select 1 from public.teams tm where (select count(distinct round) from _pa a where a.team_id = tm.id and a.round between 1 and n_rounds) <> n_rounds)
      or (select count(*) from _pa) <> n_teams * n_rounds then 'every team needs exactly one QR per round'
    when exists (select 1 from _pa a where not exists (select 1 from public.teams tm where tm.id = a.team_id)) then 'unknown team'
    when exists (select 1 from _pa a left join _pq q on q.ref = a.qr where q.ref is null or q.round <> a.round) then 'assignment QR is not in that round'
    when exists (select 1 from _pa where round = 1 group by qr
                 having count(*) > ceil(n_teams::numeric / (select qr_count from _pr where number = 1)) + 2) then 'too many teams start on one QR'
    when exists (select 1 from _pa a join _pa b on b.team_id = a.team_id and b.round = a.round + 1
                 where not exists (select 1 from _pl l where l."from" = a.qr and l."to" = b.qr)) then 'a team path breaks'
    else null
  end;
  if bad is not null then raise exception 'BAD_PLAN: %', bad; end if;

  delete from public.assignments where true;
  delete from public.qr_links where true;
  delete from public.qr_codes where kind <> 'universal';
  delete from public.round_results where true;
  delete from public.rounds where true;

  insert into public.rounds (number, qr_count, advance_count, difficulty, is_final)
    select number, qr_count, advance_count, difficulty, number = n_rounds from _pr;
  -- D-033: each place keeps its printed card. Places new to the venue get a card now; the rest reuse theirs.
  insert into public.cards (location_id, token, key)
    select location_id, public._token(), public._random_code(6) from _pq
    on conflict (location_id) do nothing;
  get diagnostics new_cards = row_count;
  insert into public.qr_codes (id, round, kind, location_id, token, key, label)
    select q.id, q.round, q.kind, q.location_id, c.token, c.key, q.ref from _pq q join public.cards c on c.location_id = q.location_id;
  insert into public.qr_links (from_qr, to_qr)
    select f.id, t.id from _pl l join _pq f on f.ref = l."from" join _pq t on t.ref = l."to";
  insert into public.assignments (team_id, round, qr_id)
    select a.team_id, a.round, q.id from _pa a join _pq q on q.ref = a.qr;
  update public.qr_codes c set is_spare = not exists (select 1 from public.assignments a where a.qr_id = c.id)
   where c.round = 1;
  update public.games set status = 'READY' where id = 1;

  perform public._audit('apply_game_plan', null, null, jsonb_build_object('rounds', n_rounds,
    'qrs', (select count(*) from _pq where kind <> 'prank'), 'pranks', (select count(*) from _pq where kind = 'prank'),
    'new_cards', new_cards));
  perform public._refresh_public();
  return jsonb_build_object('rounds', n_rounds, 'qrs', (select count(*) from public.qr_codes), 'new_cards', new_cards);
end $$;
delete from public.assignments where qr_id in (select id from public.qr_codes where kind = 'universal');
delete from public.qr_codes where kind = 'universal';

-- New Game with kept crews clears the names too.
create or replace function public._unlock_crew_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.code is distinct from old.code then new.named := false; new.members := '{}'; end if;
  return new;
end $$;
