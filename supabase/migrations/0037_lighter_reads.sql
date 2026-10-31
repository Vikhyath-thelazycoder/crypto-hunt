-- T-1005: fewer reads on every status check and leaderboard rebuild. The map, ships, fog regions and per-member check-ins
-- are gone from the game, so nothing computes them. The 3 s leaderboard rebuild is now 5 s.
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
  pieces_solved int;
  total_rounds int;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  select * into t from public.teams where id = p.team_id;
  select * into ts from public.team_state where team_id = t.id;
  select count(*) into total_rounds from public.rounds;
  if ts.team_id is not null then
    select * into rd from public.rounds where number = ts.round;
    select * into my from public.tasks where player_id = p.id and round = ts.round;
    if my.id is not null then select * into q from public.questions where id = my.question_id; end if;
    select count(*) into pieces_solved from public.tasks where team_id = t.id and round = ts.round and solved_at is not null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'player', jsonb_build_object('id', p.id, 'name', p.name, 'is_active', p.is_active),
    'team', jsonb_build_object('id', t.id, 'number', t.number, 'name', t.name, 'status', t.status,
      'code', t.code, 'crew', t.members, 'final_rank', t.final_rank, 'eliminated_in_round', t.eliminated_in_round, 'eliminated_view', t.eliminated_view,
      'completion_key', case when t.status = 'finished' then t.completion_key end,
      'named', t.named,
      'can_name', not t.named and g.status not in ('RUNNING', 'PAUSED', 'FINISHED')
        and p.id = (select f.id from public.players f where f.team_id = t.id and f.is_active
                     order by f.created_at, f.id limit 1)),
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
    -- Own task only, never its answer.
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
          -- D-033: the clue set drawn for this crew at this mark (T-507).
          (select coalesce(cs.riddle, array_to_string(cs.pieces, E'\n')) from public.assignments a
             join public.qr_codes c on c.id = a.qr_id
             join public.clue_sets cs on cs.location_id = c.location_id and cs.set_no = a.clue_set
            where a.team_id = t.id and a.round = ts.round) end
      ) order by x.piece_index) from public.tasks x where x.team_id = t.id and x.round = ts.round), '[]'),
    -- D-026: the crew seal code, only in the final round once the final clue is complete.
    'seal_code', case when rd.is_final and pieces_solved >= 1 then t.final_code end
  );
end $$;

create or replace function public._rebuild_public() returns void
language plpgsql set search_path = public as $$
declare
  g public.games;
  d jsonb;
begin
  select * into g from public.games where id = 1;
  select jsonb_build_object(
    'status', g.status,
    'paused', g.status = 'PAUSED',
    'registration_open', g.registration_open,
    'hints_enabled', g.hints_enabled,
    'broadcast', g.broadcast,
    'broadcast_at', g.broadcast_at,
    'started_at', g.started_at,
    'finished_at', g.finished_at,
    'total_rounds', (select count(*) from public.rounds),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', r.number, 'advance', r.advance_count, 'is_final', r.is_final, 'closed', r.closed_at is not null,
        'completed', (select count(*) from public.round_results x where x.round = r.number)) order by r.number)
      from public.rounds r), '[]'),
    'teams', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.sort_group, t.final_rank nulls last,
                       t.rounds_completed desc, t.last_completed_at nulls last, t.number)
      from (
        select tm.id, tm.number, tm.name, tm.status, tm.final_rank, tm.eliminated_in_round,
               ts.round, ts.phase, ts.penalty_ms, ts.penalty_until,
               (select count(*) from public.players p where p.team_id = tm.id) as members,
               (select count(*) from public.round_results r where r.team_id = tm.id) as rounds_completed,
               (select max(completed_at) from public.round_results r where r.team_id = tm.id) as last_completed_at,
               case tm.status when 'finished' then 0 when 'active' then 1 when 'eliminated' then 2 else 3 end as sort_group,
               case when tm.status = 'finished' and g.started_at is not null then
                 (select floor(extract(epoch from (rr.completed_at - g.started_at)) * 1000)::bigint
                    from public.round_results rr join public.rounds rd on rd.number = rr.round and rd.is_final
                   where rr.team_id = tm.id) end as finish_ms,
               case when tm.status = 'finished' then
                 (select jsonb_agg(p.name order by p.created_at) from public.players p where p.team_id = tm.id) || to_jsonb(tm.members) end as crew
        from public.teams tm left join public.team_state ts on ts.team_id = tm.id
      ) t), '[]'),
    'latest', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'team', e.team, 'round', e.round, 'rank', e.rank,
                                          'ms', e.ms, 'at', e.at) order by e.id desc)
      from (
        select ev.id, ev.kind, tm.name as team, (ev.data->>'round')::int as round, (ev.data->>'rank')::int as rank,
               (ev.data->>'ms')::bigint as ms, ev.at
          from public.events ev left join public.teams tm on tm.id = ev.team_id
         where ev.kind in ('round_completed', 'clue_complete', 'penalty_started', 'eliminated', 'finished',
                           'round_closed', 'game_started', 'game_ended')
         order by ev.id desc limit 6
      ) e), '[]')
  ) into d;
  update public.public_state set data = d, event_seq = event_seq + 1, updated_at = now()
   where id = 1 and data is distinct from d;
end $$;

select cron.alter_job((select jobid from cron.job where jobname = 'rebuild-public'), schedule => '5 seconds');
