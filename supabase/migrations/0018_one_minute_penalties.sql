-- D-041: penalties are one minute each, all served at the next check-in (D-013).
-- * A hint adds 1 minute (was 2).
-- * Wrong answers, multiple choice and typed alike: every 3rd wrong on a player's question adds 1 minute to
--   the crew's penalty, then the count restarts (3rd, 6th, 9th …). A new round is a new task, so it restarts too.
-- * The multiple-choice lockout (D-030) is gone: nobody is ever stopped from answering. A wrong pick still
--   swaps in a different question (D-029).

alter table public.games alter column hint_penalty_ms set default 60000;
update public.games set hint_penalty_ms = 60000 where hint_penalty_ms = 120000;
alter table public.games
  add column wrong_penalty_ms int not null default 60000 check (wrong_penalty_ms >= 0);

alter table public.tasks rename column mcq_strikes to strikes;
alter table public.tasks drop column locked_until;

drop function public.set_mcq_lockout(int);

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
  third boolean;
  replaced boolean := false;
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
  end if;

  if not public._answer_ok(q, p_answer) then
    third := tk.strikes + 1 >= 3;
    update public.tasks
       set wrong_count = wrong_count + 1,
           strikes = case when third then 0 else strikes + 1 end
     where id = tk.id
     returning strikes into tk.strikes;
    if q.format = 'mcq' then
      -- D-029: a wrong pick swaps in a different question at once; the swapped-out one never comes back.
      update public.tasks
         set replaced_questions = replaced_questions || tk.question_id,
             question_id = public._pick_question(t.id, q.difficulty), hint_used = false
       where id = tk.id;
      update public.tasks set option_order = public._option_order(question_id) where id = tk.id;
      perform public._event(t.id, p.id, 'mcq_swapped', jsonb_build_object('round', ts.round));
      replaced := true;
    else
      perform public._event(t.id, p.id, 'wrong_answer', jsonb_build_object('round', ts.round,
        'answer', left(btrim(coalesce(p_answer, '')), 80)));
    end if;
    -- D-041: every 3rd wrong adds the wrong-answer penalty, served at check-in.
    if third then
      update public.team_state set penalty_ms = penalty_ms + g.wrong_penalty_ms, updated_at = now()
       where team_id = t.id returning penalty_ms into ts.penalty_ms;
      perform public._event(t.id, p.id, 'wrong_penalty', jsonb_build_object('round', ts.round,
        'added_ms', g.wrong_penalty_ms, 'penalty_ms', ts.penalty_ms));
      perform public._refresh_public();
    end if;
    return jsonb_build_object('ok', true, 'correct', false, 'replaced', replaced, 'strikes', tk.strikes,
      'penalized', third, 'penalty_ms', ts.penalty_ms);
  end if;

  update public.tasks set solved_at = now(), solved_by = p.id where id = tk.id;
  perform public._event(t.id, p.id, 'solved', jsonb_build_object('round', ts.round, 'piece', tk.piece_index));
  solved := public._after_piece(t.id);
  perform public._refresh_public();
  return jsonb_build_object('ok', true, 'correct', true, 'pieces', solved);
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
      'broadcast', g.broadcast, 'broadcast_at', g.broadcast_at, 'hint_penalty_ms', g.hint_penalty_ms,
      'wrong_penalty_ms', g.wrong_penalty_ms),
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
      'strikes', my.strikes,
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

-- Lockouts are gone, so resume only shifts penalties and scan tickets.
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

-- The dashboard shows the wrong-answer penalty in place of the lockout.
create or replace function public.admin_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  g public.games;
  since timestamptz;
begin
  perform public._admin();
  select * into g from public.games where id = 1;
  -- The audit log is kept across games (D-027); the ship's log shows this game's entries only.
  select max(at) into since from public.admin_audit where action = 'start_new_game';

  return jsonb_build_object(
    'now', now(),
    'game', jsonb_build_object('status', g.status, 'registration_open', g.registration_open,
      'hints_enabled', g.hints_enabled, 'hint_penalty_ms', g.hint_penalty_ms, 'wrong_penalty_ms', g.wrong_penalty_ms,
      'paused_at', g.paused_at, 'broadcast', g.broadcast, 'broadcast_at', g.broadcast_at,
      'started_at', g.started_at, 'finished_at', g.finished_at, 'end_reason', g.end_reason,
      'resumed_at', (select max(at) from public.events where kind = 'resumed')),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object(
        'number', r.number, 'qr_count', r.qr_count, 'advance', r.advance_count, 'difficulty', r.difficulty,
        'is_final', r.is_final, 'closed_at', r.closed_at,
        'completed', (select count(*) from public.round_results x where x.round = r.number)) order by r.number)
      from public.rounds r), '[]'),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'number', t.number, 'name', t.name, 'code', t.code, 'status', t.status,
        'final_rank', t.final_rank, 'completion_key', t.completion_key, 'eliminated_in_round', t.eliminated_in_round,
        'eliminated_at', (select max(e.at) from public.events e where e.team_id = t.id and e.kind = 'eliminated'),
        'has_route', exists (select 1 from public.assignments a where a.team_id = t.id),
        'round', ts.round, 'phase', ts.phase, 'penalty_ms', ts.penalty_ms, 'penalty_until', ts.penalty_until,
        'round_started_at', ts.round_started_at, 'phase_since', ts.updated_at, 'locked_scans', ts.locked_scans,
        'target', (select c.label from public.assignments a join public.qr_codes c on c.id = a.qr_id
                    where a.team_id = t.id and a.round = ts.round),
        'pieces_solved', (select count(*) from public.tasks x
                           where x.team_id = t.id and x.round = ts.round and x.solved_at is not null),
        'hints_round', (select count(*) from public.tasks x where x.team_id = t.id and x.round = ts.round and x.hint_used),
        'hints_total', (select count(*) from public.tasks x where x.team_id = t.id and x.hint_used),
        'rounds_completed', (select count(*) from public.round_results x where x.team_id = t.id),
        'last_completed_at', (select max(x.completed_at) from public.round_results x where x.team_id = t.id),
        'members', coalesce((select jsonb_agg(jsonb_build_object(
            'id', p.id, 'name', p.name, 'is_active', p.is_active, 'joined_at', p.created_at,
            'opened', exists (select 1 from public.tasks x where x.player_id = p.id and x.round = ts.round and x.opened_at is not null),
            'solved', exists (select 1 from public.tasks x where x.player_id = p.id and x.round = ts.round and x.solved_at is not null),
            'scanned', exists (select 1 from public.checkins c where c.player_id = p.id and c.round = ts.round),
            'checked_in', exists (select 1 from public.checkins c where c.player_id = p.id and c.round = ts.round and c.key_ok_at is not null)
          ) order by p.created_at) from public.players p where p.team_id = t.id), '[]')
      ) order by t.number) from public.teams t left join public.team_state ts on ts.team_id = t.id), '[]'),
    'alerts', coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
        select a.id, a.kind, a.data, a.at, a.team_id, tm.name as team, pl.name as player,
               (select l.name from public.qr_codes c join public.locations l on l.id = c.location_id
                 where c.label = a.data ->> 'qr') as place
        from public.alerts a
        left join public.teams tm on tm.id = a.team_id
        left join public.players pl on pl.id = a.player_id
        where not a.acknowledged
        order by a.at desc, a.id desc
        limit 200) x), '[]'),
    'open_alerts', (select count(*) from public.alerts where not acknowledged),
    'open_by_kind', coalesce((select jsonb_object_agg(kind, n) from (
        select kind, count(*) as n from public.alerts where not acknowledged group by kind) k), '{}'),
    'pranks', jsonb_build_object(
      'total', (select count(*) from public.alerts where kind = 'prank'),
      'top_team', (select tm.name from public.alerts a join public.teams tm on tm.id = a.team_id
                    where a.kind = 'prank' group by tm.name order by count(*) desc, tm.name limit 1),
      'top_count', (select count(*) from public.alerts a where a.kind = 'prank' group by a.team_id
                     order by count(*) desc limit 1)),
    'log', coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
        (select 'event' as src, e.id, e.kind, e.data, e.at, tm.name as team, pl.name as player, null::text as reason, null::text as target,
                (select l.name from public.qr_codes c join public.locations l on l.id = c.location_id
                  where c.label = e.data ->> 'qr') as place
         from public.events e
         left join public.teams tm on tm.id = e.team_id
         left join public.players pl on pl.id = e.player_id
         where e.kind not like 'alert:%' and e.kind not in ('wrong_answer', 'mcq_swapped', 'bad_qr')
         order by e.at desc, e.id desc
         limit 80)
        union all
        (select 'audit', a.id, a.action, a.data, a.at,
                coalesce((select name from public.teams where id::text = a.target),
                         (select tm.name from public.players p join public.teams tm on tm.id = p.team_id
                           where p.id::text = a.target)),
                (select name from public.players where id::text = a.target),
                a.reason, a.target, null
         from public.admin_audit a
         where since is null or a.at >= since
         order by a.at desc, a.id desc
         limit 40)) x), '[]'),
    'course', jsonb_build_object(
      'marks', (select count(*) from public.qr_codes where kind in ('target', 'final')),
      'pranks', (select count(*) from public.qr_codes where kind = 'prank'),
      'spares', (select count(*) from public.qr_codes where is_spare),
      'universal', exists (select 1 from public.qr_codes where kind = 'universal')),
    'questions', jsonb_build_object(
      'enabled', (select count(*) from public.questions where is_enabled),
      'by_difficulty', coalesce((select jsonb_object_agg(difficulty, n) from (
          select difficulty, count(*) as n from public.questions where is_enabled group by difficulty) d), '{}')),
    'locations', (select count(*) from public.locations)
  );
end $$;

alter table public.games drop column mcq_lockout_ms;
