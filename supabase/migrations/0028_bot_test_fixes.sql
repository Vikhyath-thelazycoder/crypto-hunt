-- P8 bot-test fixes (docs/reports/flaws.md F-01 … F-03).
--
-- F-01 (blocker) Join storm: every phone at the event shares the venue Wi-Fi's one public address, and the join
--   limit was 60 lookups/joins per address per minute. In the 100-bot run 40 of 100 players were refused on their
--   first try and it took 67 s for everyone to get in. The limit is now 600 per address per minute: a crowd of
--   100–150 phones (a code lookup and a join each, plus retries) fits; guessing a 6-character code (32^6 ≈ 10^9)
--   at 600 a minute still takes years.
--
-- F-02 (major) When a later round filled first, crews still in earlier rounds were knocked out as "out in round V"
--   although they never left round I, and rounds I–IV were never closed, so the projector and dashboard kept
--   showing "Round I · five crews advance" during the final. Now a round closing also closes every earlier round
--   still open, and each crew it knocks out is out in the round it was actually in.
--
-- F-03 (minor) The admin kicking a player at the instant that player's phone scanned made the scan fail with a
--   server error (a foreign-key failure on the event log) instead of NOT_REGISTERED. The session check now holds a
--   key-share lock on the player row for the rest of the call, so a kick waits for the call to finish.

create or replace function public._ctx() returns public.players
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- F-03: a kick (delete) waits until this call has finished writing its events.
  select * into p from public.players where user_id = auth.uid() for key share;
  if not found or p.session_id is null then raise exception 'NOT_REGISTERED'; end if;
  if nullif(auth.jwt() ->> 'session_id', '')::uuid is distinct from p.session_id then
    raise exception 'SESSION_MOVED';
  end if;
  return p;
end $$;

create or replace function public._close_round(p_round int) returns void
language plpgsql set search_path = public as $$
declare t record;
begin
  -- F-02: earlier rounds still open close with this one (nobody can get past this round any more).
  update public.rounds set closed_at = now() where number <= p_round and closed_at is null;
  for t in
    select tm.id, ts.round from public.teams tm join public.team_state ts on ts.team_id = tm.id
    where tm.status = 'active' and ts.round <= p_round
      and not exists (select 1 from public.round_results r where r.team_id = tm.id and r.round = p_round)
  loop
    -- Out in the round the crew was actually in.
    perform public._eliminate(t.id, t.round);
  end loop;
  perform public._event(null, null, 'round_closed', jsonb_build_object('round', p_round));
end $$;

create or replace function public.team_preview(p_code text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if public._hit('ip:' || coalesce(p_ip, '?'), 'join', 60) > 600 then return public._fail('RATE_LIMITED'); end if;
  select * into t from public.teams where code = upper(btrim(coalesce(p_code, '')));
  if not found then return public._fail('BAD_CODE'); end if;
  return jsonb_build_object('ok', true, 'team', jsonb_build_object('name', t.name, 'number', t.number,
    'status', t.status,
    'members', (select coalesce(jsonb_agg(left(m.name, 1) order by m.created_at), '[]') from public.players m where m.team_id = t.id)));
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
  if t.status <> 'forming' or members >= 4 then return public._fail('TEAM_FULL'); end if;
  return jsonb_build_object('ok', true, 'user_id', null, 'takeover', false);
end $$;

revoke execute on function public._ctx(), public._close_round(int), public.team_preview(text, text),
  public.join_preflight(text, text, text) from public, anon, authenticated;
grant execute on function public.team_preview(text, text), public.join_preflight(text, text, text) to service_role;
