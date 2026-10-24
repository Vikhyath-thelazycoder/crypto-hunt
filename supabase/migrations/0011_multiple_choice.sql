-- D-029 multiple choice (supersedes D-015 for multiple choice):
-- * exactly 4 options, answer = the original option index (0–3);
-- * each player sees the options in their own shuffled order (tasks.option_order);
-- * a wrong multiple-choice answer swaps in another question at once (no second try); swapped-out
--   questions never come back to that team (tasks.replaced_questions);
-- * multiple-choice questions never give hints.
-- Typed answers (text, number) keep unlimited tries with the hidden 10/min limit.

alter table public.questions
  add constraint questions_mcq_four check (format <> 'mcq' or (jsonb_array_length(options) = 4 and answer ~ '^[0-3]$'));
alter table public.tasks
  add column option_order int[],
  add column replaced_questions uuid[] not null default '{}';

-- A random permutation of 0..3 for a multiple-choice question, null otherwise.
create or replace function public._option_order(p_question uuid) returns int[]
language sql volatile set search_path = public as $$
  select case when (select format from public.questions where id = p_question) = 'mcq'
              then (select array_agg(i order by random()) from generate_series(0, 3) as i) end;
$$;

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
  order by pass, d, random()
  limit 1;
$$;

create or replace function public._create_tasks(p_team uuid, p_round int, p_opened boolean) returns void
language plpgsql set search_path = public as $$
declare
  diff int;
  piece int := 0;
  m record;
  q uuid;
begin
  select difficulty into diff from public.rounds where number = p_round;
  for m in select id from public.players where team_id = p_team and is_active order by created_at loop
    exit when piece = 4;
    q := public._pick_question(p_team, diff);
    if q is null then raise exception 'NOT_ENOUGH_QUESTIONS'; end if;
    insert into public.tasks (team_id, player_id, round, question_id, piece_index, opened_at, option_order)
    values (p_team, m.id, p_round, q, piece, case when p_opened then now() end, public._option_order(q));
    piece := piece + 1;
  end loop;
  while piece < 4 loop
    insert into public.tasks (team_id, player_id, round, piece_index, opened_at, solved_at)
    values (p_team, null, p_round, piece, now(), now());
    piece := piece + 1;
  end loop;
end $$;

create or replace function public.submit_answer(p_task_id uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  t public.teams;
  ts public.team_state;
  tk public.tasks;
  q public.questions;
  n int;
  solved int;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status = 'PAUSED' then return public._fail('PAUSED'); end if;
  if g.status <> 'RUNNING' then return public._fail('NOT_RUNNING'); end if;
  select * into t from public.teams where id = p.team_id;
  if t.status <> 'active' then return public._fail('ELIMINATED'); end if;
  select * into tk from public.tasks where id = p_task_id;
  if not found or tk.player_id is distinct from p.id then return public._fail('NOT_YOUR_TASK'); end if;
  if tk.solved_at is not null then return public._fail('ALREADY_SOLVED'); end if;
  if tk.opened_at is null then return public._fail('NOT_OPEN'); end if;
  select * into ts from public.team_state where team_id = t.id for update;
  if tk.round <> ts.round or ts.phase <> 'SOLVING' then return public._fail('ALREADY_SOLVED'); end if;

  n := public._hit('p:' || p.id, 'answer', 60);
  if n > 10 then
    if n = 11 then perform public._alert(t.id, p.id, 'answer_spam', jsonb_build_object('round', ts.round)); end if;
    return public._fail('RATE_LIMITED');
  end if;

  select * into q from public.questions where id = tk.question_id;
  -- D-029: multiple choice is answered by the letter shown; map it back through this player's shuffle.
  if q.format = 'mcq' then
    if btrim(coalesce(p_answer, '')) !~ '^[0-3]$' then return public._fail('BAD_ANSWER'); end if;
    p_answer := tk.option_order[btrim(p_answer)::int + 1]::text;
    if not public._answer_ok(q, p_answer) then
      update public.tasks
         set wrong_count = wrong_count + 1,
             replaced_questions = replaced_questions || tk.question_id
       where id = tk.id;
      update public.tasks
         set question_id = public._pick_question(t.id, q.difficulty), hint_used = false
       where id = tk.id;
      update public.tasks set option_order = public._option_order(question_id) where id = tk.id;
      perform public._event(t.id, p.id, 'mcq_swapped', jsonb_build_object('round', ts.round));
      return jsonb_build_object('ok', true, 'correct', false, 'replaced', true);
    end if;
  end if;
  if not public._answer_ok(q, p_answer) then
    update public.tasks set wrong_count = wrong_count + 1 where id = tk.id;
    perform public._event(t.id, p.id, 'wrong_answer', jsonb_build_object('round', ts.round,
      'answer', left(btrim(coalesce(p_answer, '')), 80)));
    return jsonb_build_object('ok', true, 'correct', false);
  end if;

  update public.tasks set solved_at = now(), solved_by = p.id where id = tk.id;
  perform public._event(t.id, p.id, 'solved', jsonb_build_object('round', ts.round, 'piece', tk.piece_index));
  solved := public._after_piece(t.id);
  perform public._refresh_public();
  return jsonb_build_object('ok', true, 'correct', true, 'pieces', solved);
end $$;

create or replace function public.use_hint(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  tk public.tasks;
  ts public.team_state;
  q public.questions;
  total int;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status <> 'RUNNING' then return public._fail(case when g.status = 'PAUSED' then 'PAUSED' else 'NOT_RUNNING' end); end if;
  if not g.hints_enabled then return public._fail('HINTS_OFF'); end if;
  select * into tk from public.tasks where id = p_task_id for update;
  if not found or tk.player_id is distinct from p.id then return public._fail('NOT_YOUR_TASK'); end if;
  if tk.solved_at is not null then return public._fail('ALREADY_SOLVED'); end if;
  if tk.hint_used then return public._fail('ALREADY_USED'); end if;
  select * into ts from public.team_state where team_id = p.team_id for update;
  if tk.round <> ts.round or tk.opened_at is null then return public._fail('NOT_OPEN'); end if;
  select * into q from public.questions where id = tk.question_id;
  -- D-029: never a hint on a multiple-choice question.
  if q.hint is null or q.format = 'mcq' then return public._fail('NO_HINT'); end if;
  update public.tasks set hint_used = true where id = tk.id;
  update public.team_state set penalty_ms = penalty_ms + g.hint_penalty_ms, updated_at = now()
   where team_id = p.team_id returning penalty_ms into total;
  perform public._event(p.team_id, p.id, 'hint', jsonb_build_object('round', ts.round, 'penalty_ms', total));
  perform public._refresh_public();
  return jsonb_build_object('ok', true, 'hint', q.hint, 'penalty_ms', total);
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
  perform public._settle_penalties();
  select * into g from public.games where id = 1;
  select * into t from public.teams where id = p.team_id;
  select * into ts from public.team_state where team_id = t.id;
  select count(*) into total_rounds from public.rounds;
  if ts.team_id is not null then
    select * into rd from public.rounds where number = ts.round;
    select * into my from public.tasks where player_id = p.id and round = ts.round;
    if my.id is not null then select * into q from public.questions where id = my.question_id; end if;
    select count(*) into pieces_solved from public.tasks where team_id = t.id and round = ts.round and solved_at is not null;
    if pieces_solved = 4 then
      select l.* into target from public.assignments a join public.qr_codes c on c.id = a.qr_id
        join public.locations l on l.id = c.location_id
       where a.team_id = t.id and a.round = ts.round;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'player', jsonb_build_object('id', p.id, 'name', p.name, 'is_active', p.is_active),
    'team', jsonb_build_object('id', t.id, 'number', t.number, 'name', t.name, 'status', t.status,
      'code', t.code, 'final_rank', t.final_rank, 'eliminated_in_round', t.eliminated_in_round, 'eliminated_view', t.eliminated_view,
      'completion_key', case when t.status = 'finished' then t.completion_key end),
    'game', jsonb_build_object('status', g.status, 'hints_enabled', g.hints_enabled,
      'broadcast', g.broadcast, 'broadcast_at', g.broadcast_at, 'hint_penalty_ms', g.hint_penalty_ms),
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
    -- Own task only, never its answer. Round 1 opens when the member scans the universal QR.
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
      'has_hint', q.hint is not null and q.format <> 'mcq') end,
    'pieces', coalesce((select jsonb_agg(jsonb_build_object(
        'index', x.piece_index, 'solved', x.solved_at is not null,
        'by', (select m.name from public.players m where m.id = x.player_id), 'mine', x.player_id = p.id, 'hint', x.hint_used,
        'text', case when x.solved_at is not null then
          (select l.clue_pieces[x.piece_index + 1] from public.assignments a
             join public.qr_codes c on c.id = a.qr_id join public.locations l on l.id = c.location_id
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
    -- D-026: the crew seal code, only in the final round once the final clue is complete.
    'seal_code', case when rd.is_final and pieces_solved = 4 then t.final_code end
  );
end $$;

revoke execute on function public._option_order(uuid) from public, anon, authenticated;
