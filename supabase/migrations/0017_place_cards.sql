-- P5 · T-506 (D-033): a new pyramid every game, same printed cards.
-- * cards: one printed card (token + key) per place, kept across games. apply_game_plan reuses a place's card for
--   whatever mark the place becomes (round I, the final, a decoy…) and makes cards only for places new to the venue.
-- * start_new_game clears the course, so the next game must be generated: a fresh pyramid, no reprint, only the
--   master list. "Regenerate" now gives every place a new card (and the universal QR a new code): reprint all.
-- * scan_qr: a real card whose place sits out this game answers UNUSED_MARK, with no alert.
create table public.cards (
  location_id uuid primary key references public.locations (id) on delete cascade,
  token text not null unique,
  key text not null check (key ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);
-- Secrets: no client reads or writes them; only the security-definer functions below.
alter table public.cards enable row level security;
revoke all on public.cards from public, anon, authenticated;

-- The cards already printed: keep them.
insert into public.cards (location_id, token, key)
  select location_id, token, key from public.qr_codes where location_id is not null
  on conflict (location_id) do nothing;

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
  if not exists (select 1 from public.qr_codes where kind = 'universal') then
    insert into public.qr_codes (kind, token, key, label) values ('universal', public._token(), public._random_code(6), 'U');
  end if;
  update public.games set status = 'READY' where id = 1;

  perform public._audit('apply_game_plan', null, null, jsonb_build_object('rounds', n_rounds,
    'qrs', (select count(*) from _pq where kind <> 'prank'), 'pranks', (select count(*) from _pq where kind = 'prank'),
    'new_cards', new_cards));
  perform public._refresh_public();
  return jsonb_build_object('rounds', n_rounds, 'qrs', (select count(*) from public.qr_codes), 'new_cards', new_cards);
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
  -- D-033: every game gets a new pyramid. The course goes (rounds, marks, links, routes); the cards stay with
  -- their places, so generating the next course needs no reprint, only a new master list.
  delete from public.assignments where true;
  delete from public.qr_links where true;
  delete from public.qr_codes where kind <> 'universal';
  delete from public.events where true;
  delete from public.alerts where true;
  delete from public.rate_limits where true;
  delete from public.rounds where true;
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
    update public.cards set token = public._token(), key = public._random_code(6), created_at = now() where true;
    update public.qr_codes set token = public._token(), key = public._random_code(6) where kind = 'universal';
  end if;
  update public.games set status = case when exists (select 1 from public.teams) then 'REGISTRATION' else 'SETUP' end,
    registration_open = exists (select 1 from public.teams), hints_enabled = false, paused_at = null,
    broadcast = null, broadcast_at = null, started_at = null, finished_at = null, end_reason = null where id = 1;
  perform public._audit('start_new_game', null, null, jsonb_build_object('regenerate_qr', p_regenerate_qr));
  perform public._refresh_public();
end $$;

create or replace function public.scan_qr(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  t public.teams;
  ts public.team_state;
  q public.qr_codes;
  own boolean;
  n int;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status = 'PAUSED' then return public._fail('PAUSED'); end if;
  if g.status <> 'RUNNING' then return public._fail('NOT_RUNNING'); end if;
  select * into t from public.teams where id = p.team_id;
  if t.status in ('eliminated', 'disqualified') then return public._fail('ELIMINATED'); end if;
  if t.status = 'finished' then return public._fail('FINISHED'); end if;
  if not p.is_active then return public._fail('INACTIVE'); end if;
  if public._hit('p:' || p.id, 'scan', 60) > 30 then return public._fail('RATE_LIMITED'); end if;

  perform public._settle_penalties();
  select * into ts from public.team_state where team_id = t.id for update;
  select * into q from public.qr_codes where token = btrim(coalesce(p_token, ''));
  if not found then
    -- A real card whose place isn't in this game's course (it stays hidden between games, D-033): not a fake
    -- code, so no alert; the player is told plainly to move on.
    if exists (select 1 from public.cards where token = btrim(coalesce(p_token, ''))) then
      return public._fail('UNUSED_MARK');
    end if;
    perform public._event(t.id, p.id, 'bad_qr');
    if public._hit('p:' || p.id, 'bad_qr', 600) = 3 then perform public._alert(t.id, p.id, 'bad_qr', '{}'); end if;
    return public._fail('BAD_QR');
  end if;

  if q.kind = 'prank' then
    perform public._alert(t.id, p.id, 'prank', jsonb_build_object('qr', q.label, 'round', ts.round));
    perform public._refresh_public();
    return jsonb_build_object('ok', true, 'result', 'PRANK', 'round', ts.round, 'fake_key', public._random_code(6));
  end if;

  if q.kind = 'universal' then
    if ts.round <> 1 then return public._fail('ALREADY_DONE'); end if;
    update public.tasks set opened_at = coalesce(opened_at, now()) where player_id = p.id and round = 1;
    perform public._event(t.id, p.id, 'opened_round_one');
    return jsonb_build_object('ok', true, 'result', 'QUESTION');
  end if;

  if q.round < ts.round then return public._fail('ALREADY_DONE'); end if;
  own := exists (select 1 from public.assignments a where a.team_id = t.id and a.round = q.round and a.qr_id = q.id);

  -- A later round's mark: same answer whether or not it's on this team's path; no ticket, nothing stored.
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
    perform public._alert(t.id, p.id, 'wrong_team', jsonb_build_object('qr', q.label, 'round', q.round,
      'owners', (select coalesce(jsonb_agg(tm.name), '[]') from public.assignments a join public.teams tm on tm.id = a.team_id
                  where a.qr_id = q.id and a.round = q.round), 'spare', q.is_spare));
    return public._fail('NOT_YOURS');
  end if;
  if ts.phase = 'SOLVING' then
    perform public._event(t.id, p.id, 'found_early', jsonb_build_object('qr', q.label));
    return public._fail('SOLVE_FIRST');
  end if;
  if ts.phase not in ('SEEKING', 'CHECKING_IN') then return public._fail('ALREADY_DONE'); end if;
  if exists (select 1 from public.checkins where player_id = p.id and round = ts.round and key_ok_at is not null) then
    return public._fail('ALREADY_CHECKED_IN');
  end if;

  insert into public.checkins (player_id, round, qr_id) values (p.id, ts.round, q.id)
  on conflict (player_id, round) do update set qr_id = excluded.qr_id, scanned_at = now();
  insert into public.scan_tickets (player_id, qr_id, round) values (p.id, q.id, ts.round)
  on conflict (player_id) do update
    set qr_id = excluded.qr_id, round = excluded.round, issued_at = now(), expires_at = now() + interval '10 minutes';
  if ts.phase = 'SEEKING' then
    update public.team_state set phase = 'CHECKING_IN', updated_at = now() where team_id = t.id;
  end if;
  perform public._event(t.id, p.id, 'scanned', jsonb_build_object('qr', q.label));
  perform public._refresh_public();
  return jsonb_build_object('ok', true,
    'result', case when q.kind = 'final' then 'ASK_KEY_AND_SEAL' else 'ASK_KEY' end, 'qr', q.label);
end $$;
