-- P8 bot-test fix F-05 (major): under a 100-player load, actions timed out ("canceling statement due to statement
-- timeout", 15 in one run; check-ins took up to 7.7 s). Every player action first settles the crews whose penalty
-- has run out. When a crew's penalty ended, every concurrent action queued on that crew's row to settle it, one
-- after another, each holding its own locks while it waited. Now one action settles a crew and the others skip it
-- (SKIP LOCKED); the crew's state is re-checked after the lock, so a crew is never completed twice.

create or replace function public._settle_penalties() returns void
language plpgsql set search_path = public as $$
declare t record;
begin
  if (select status from public.games where id = 1) <> 'RUNNING' then return; end if;
  for t in
    select team_id, penalty_until from public.team_state
     where phase = 'PENALTY' and penalty_until <= now()
     order by penalty_until
     for update skip locked
  loop
    -- Locked and re-read: still serving that penalty, and it is over.
    if exists (select 1 from public.team_state s
                where s.team_id = t.team_id and s.phase = 'PENALTY' and s.penalty_until <= now()) then
      perform public._complete_round(t.team_id, t.penalty_until);
    end if;
  end loop;
end $$;

revoke execute on function public._settle_penalties() from public, anon, authenticated;
