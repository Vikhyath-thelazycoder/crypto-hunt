-- P5 · T-501: the captain edits the question bank live. A question a player holds right now (an unsolved task
-- while the hunt runs or is paused) can't be deleted, and its wording, format, options or answers can't change
-- under them: the multiple-choice shuffle and the grading depend on them. Turning it off (is_enabled) and its
-- category stay free: it then stops being dealt but the player keeps it.
create function public._question_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.games where id = 1 and status in ('RUNNING', 'PAUSED')) then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from public.tasks t where t.question_id = old.id and t.solved_at is null) then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then raise exception 'QUESTION_IN_USE'; end if;
  if (new.text, new.format, new.options, new.answer, new.alternatives, new.hint, new.difficulty)
     is distinct from (old.text, old.format, old.options, old.answer, old.alternatives, old.hint, old.difficulty) then
    raise exception 'QUESTION_IN_USE';
  end if;
  return new;
end $$;
revoke all on function public._question_guard() from public, anon, authenticated;

create trigger questions_guard before update or delete on public.questions
  for each row execute function public._question_guard();
