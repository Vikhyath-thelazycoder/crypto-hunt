-- 1. Supabase rejects DELETE/UPDATE without WHERE on API requests (safeupdate). The functions that clear
--    whole tables say so explicitly.
-- 2. Function privileges: 0002's default-privilege revoke only covered the role that ran it, and Supabase's own
--    defaults grant EXECUTE to anon and authenticated, so every function (internal helpers included) was
--    callable by clients. Revoke everything, grant back exactly the intended API, and lock future functions.

create or replace function public.apply_game_plan(p_plan jsonb) returns jsonb
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

  delete from public.assignments where true;
  delete from public.qr_links where true;
  delete from public.qr_codes where kind <> 'universal';
  delete from public.round_results where true;
  delete from public.rounds where true;

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

create or replace function public.resume_game() returns void
language plpgsql security definer set search_path = public as $$
declare paused_for interval;
begin
  perform public._admin();
  select now() - paused_at into paused_for from public.games where id = 1 and status = 'PAUSED';
  if paused_for is null then raise exception 'NOT_PAUSED'; end if;
  update public.team_state set penalty_until = penalty_until + paused_for where phase = 'PENALTY';
  update public.scan_tickets set expires_at = expires_at + paused_for where true;
  update public.games set status = 'RUNNING', paused_at = null where id = 1;
  perform public._event(null, null, 'resumed');
  perform public._audit('resume_game', null, null);
  perform public._refresh_public();
end $$;

create or replace function public.end_game(p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update public.games set status = 'FINISHED', finished_at = now(), end_reason = coalesce(nullif(btrim(p_reason), ''), 'ended by admin')
   where id = 1 and status in ('RUNNING', 'PAUSED');
  if not found then raise exception 'NOT_RUNNING'; end if;
  delete from public.scan_tickets where true;
  perform public._event(null, null, 'game_ended', jsonb_build_object('reason', p_reason));
  perform public._audit('end_game', null, p_reason);
  perform public._refresh_public();
end $$;

create or replace function public.start_new_game(p_confirm text, p_regenerate_qr boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  perform public._admin();
  if p_confirm is distinct from 'NEW GAME' then raise exception 'CONFIRM_REQUIRED'; end if;
  perform public._delete_player_users(array(select user_id from public.players));
  delete from public.scan_tickets where true;
  delete from public.checkins where true;
  delete from public.tasks where true;
  delete from public.round_results where true;
  delete from public.team_state where true;
  delete from public.players where true;
  delete from public.assignments where true;
  delete from public.events where true;
  delete from public.alerts where true;
  delete from public.rate_limits where true;
  update public.rounds set closed_at = null where true;
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
    update public.qr_codes set token = public._token(), key = public._random_code(6) where true;
  end if;
  update public.qr_codes set is_spare = false where round = 1;
  update public.games set status = case when exists (select 1 from public.teams) then 'REGISTRATION' else 'SETUP' end,
    registration_open = exists (select 1 from public.teams), hints_enabled = false, paused_at = null,
    broadcast = null, broadcast_at = null, started_at = null, finished_at = null, end_reason = null where id = 1;
  perform public._audit('start_new_game', null, null, jsonb_build_object('regenerate_qr', p_regenerate_qr));
  perform public._refresh_public();
end $$;


revoke execute on all functions in schema public from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function public.is_admin(), public.my_team_id() to authenticated;

-- Player API
grant execute on function
  public.claim_session(text), public.my_status(), public.scan_qr(text), public.submit_answer(uuid, text),
  public.use_hint(uuid), public.submit_key(text, text, text), public.complete_round(),
  public.report_focus_event(uuid, text, int), public.set_eliminated_view(text)
to authenticated;

-- Admin API (each checks is_admin())
grant execute on function
  public.create_teams(int), public.rename_team(uuid, text), public.delete_team(uuid, text),
  public.set_registration(boolean), public.apply_game_plan(jsonb), public.start_game(), public.pause_game(),
  public.resume_game(), public.broadcast(text), public.set_hints(boolean), public.set_advance_count(int, int),
  public.end_game(text), public.move_team(uuid, int, text), public.set_member_inactive(uuid, boolean, text),
  public.repoint_team(uuid, uuid, text), public.kick_player(uuid, text), public.disqualify_team(uuid, text),
  public.force_complete(uuid, text), public.ack_alert(bigint), public.export_results(),
  public.start_new_game(text, boolean)
to authenticated;

-- Join (player-join Edge Function only)
grant execute on function public.join_preflight(text, text, text), public.join_commit(uuid, text, text) to service_role;
