-- P8 bot-test fix F-10 (major): deadlocks when many crews finish a round at once (30-crew load run: "deadlock
-- detected" in the Postgres log, 9 actions timed out). Crew A's check-in filled the round's last place: it held the
-- round's row and went to knock out crew B (crew B's progress row). At the same instant crew B's check-in held its
-- own progress row and waited for the round's row. Each waited for the other.
--
-- Fix: everything that can complete or close a round first takes one transaction-scoped "round progress" lock, so
-- they always lock in the same order. Check-ins are short (~30 ms), so queueing them costs nothing a player notices.
-- The originals are renamed and wrapped, so their bodies are unchanged.

create or replace function public._round_progress_lock() returns void
language sql set search_path = public as $$
  select pg_advisory_xact_lock(7171717);
$$;

alter function public.submit_key(text, text, text) rename to _submit_key_body;
create function public.submit_key(p_token text, p_key text, p_seal_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._round_progress_lock();
  return public._submit_key_body(p_token, p_key, p_seal_code);
end $$;

alter function public.set_advance_count(int, int) rename to _set_advance_count_body;
create function public.set_advance_count(p_round int, p_x int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._round_progress_lock();
  perform public._set_advance_count_body(p_round, p_x);
end $$;

alter function public.force_complete(uuid, text) rename to _force_complete_body;
create function public.force_complete(p_team uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._round_progress_lock();
  return public._force_complete_body(p_team, p_reason);
end $$;

-- Settling an expired penalty completes that crew's round: take the same lock first, only when there is one to settle.
create or replace function public._settle_penalties() returns void
language plpgsql set search_path = public as $$
declare t record;
begin
  if (select status from public.games where id = 1) <> 'RUNNING' then return; end if;
  if not exists (select 1 from public.team_state where phase = 'PENALTY' and penalty_until <= now()) then return; end if;
  perform public._round_progress_lock();
  for t in
    select team_id, penalty_until from public.team_state
     where phase = 'PENALTY' and penalty_until <= now()
     order by penalty_until
     for update skip locked
  loop
    if exists (select 1 from public.team_state s
                where s.team_id = t.team_id and s.phase = 'PENALTY' and s.penalty_until <= now()) then
      perform public._complete_round(t.team_id, t.penalty_until);
    end if;
  end loop;
end $$;

-- The bodies are internal now; only the wrappers are callable (D-028).
revoke execute on function public._round_progress_lock(), public._submit_key_body(text, text, text),
  public._set_advance_count_body(int, int), public._force_complete_body(uuid, text), public._settle_penalties()
  from public, anon, authenticated;
revoke execute on function public.submit_key(text, text, text), public.set_advance_count(int, int),
  public.force_complete(uuid, text) from public, anon;
grant execute on function public.submit_key(text, text, text), public.set_advance_count(int, int),
  public.force_complete(uuid, text) to authenticated;
