-- P5 · T-508 (D-039): round 1 is capped at 15 QRs, so with more than 15 teams several teams share a round-1 QR.
-- apply_game_plan no longer needs a round-1 QR per team; instead no round-1 QR may carry more than
-- ⌈teams ÷ round-1 QRs⌉ teams. _assign_paths (teams routed at Start after New Game) picks the least-used round-1 QR
-- instead of refusing when every one is taken. Scans, check-ins and the round lock already work per team.

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
    -- Paths: every team exactly one QR per round, starts spread evenly (D-039), each step follows the links.
    when exists (select 1 from public.teams tm where (select count(distinct round) from _pa a where a.team_id = tm.id and a.round between 1 and n_rounds) <> n_rounds)
      or (select count(*) from _pa) <> n_teams * n_rounds then 'every team needs exactly one QR per round'
    when exists (select 1 from _pa a where not exists (select 1 from public.teams tm where tm.id = a.team_id)) then 'unknown team'
    when exists (select 1 from _pa a left join _pq q on q.ref = a.qr where q.ref is null or q.round <> a.round) then 'assignment QR is not in that round'
    when exists (select 1 from _pa where round = 1 group by qr
                 having count(*) > ceil(n_teams::numeric / (select qr_count from _pr where number = 1))) then 'too many teams start on one QR'
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

-- Paths for teams without one (after New Game reuses the printed QRs): the least-used round-1 QR (random among
-- ties), so teams share only when there are more teams than round-1 QRs; then follow the links.
create or replace function public._assign_paths() returns void
language plpgsql set search_path = public as $$
declare
  t record;
  q uuid;
  r int;
  rounds_n int;
begin
  select count(*) into rounds_n from public.rounds;
  for t in select id from public.teams tm where not exists (select 1 from public.assignments a where a.team_id = tm.id) order by number loop
    select c.id into q from public.qr_codes c
     where c.round = 1
     order by (select count(*) from public.assignments a where a.qr_id = c.id and a.round = 1), random() limit 1;
    if q is null then raise exception 'NOT_ENOUGH_ROUND_ONE_QRS'; end if;
    for r in 1..rounds_n loop
      insert into public.assignments (team_id, round, qr_id) values (t.id, r, q);
      if r < rounds_n then select to_qr into q from public.qr_links where from_qr = q; end if;
    end loop;
  end loop;
  update public.qr_codes c set is_spare = (c.round = 1 and not exists (select 1 from public.assignments a where a.qr_id = c.id))
   where c.round = 1;
end $$;
