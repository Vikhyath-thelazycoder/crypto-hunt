-- D-044: New Game keeps the crews but gives them new codes for new players (D-020), so the next first member gets to
-- name the crew again. A new code unlocks the name.
create function public._unlock_crew_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.code is distinct from old.code then new.named := false; end if;
  return new;
end $$;
revoke execute on function public._unlock_crew_name() from public, anon, authenticated;

create trigger teams_unlock_name before update of code on public.teams
  for each row execute function public._unlock_crew_name();
