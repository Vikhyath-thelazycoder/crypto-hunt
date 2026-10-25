-- P5 · T-502: crews in the same round should rarely hold the same question, or one crew can pass answers to
-- another. Same as 0011's pick (never one the crew has seen, nearest difficulty first), but among equally near
-- questions it prefers one no other crew is holding right now (an unsolved task). With the seed bank sized for
-- 10 crews (supabase/seed/questions.csv) every crew in a round gets its own; with more crews, sharing starts only
-- once the level's questions run out.
create or replace function public._pick_question(p_team uuid, p_difficulty int) returns uuid
language sql volatile set search_path = public as $$
  select id from (
    select q.id, 0 as pass, abs(q.difficulty - p_difficulty) as d from public.questions q
     where q.is_enabled
       and not exists (select 1 from public.tasks t
                        where t.team_id = p_team and (t.question_id = q.id or q.id = any (t.replaced_questions)))
    union all
    select q.id, 1, abs(q.difficulty - p_difficulty) from public.questions q
     where q.is_enabled
       and not exists (select 1 from public.tasks t
                        where t.team_id = p_team and t.solved_at is null and t.question_id = q.id)
  ) c
  order by pass, d,
           exists (select 1 from public.tasks o
                    where o.question_id = c.id and o.solved_at is null and o.team_id <> p_team),
           random()
  limit 1;
$$;
revoke all on function public._pick_question(uuid, int) from public, anon, authenticated;
