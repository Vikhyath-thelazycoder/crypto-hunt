-- T-1204: the 3 teammates are names on the crew, not accounts: the admin panel and the winners' screen show them.
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
        'crew', t.members,
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
    -- The universal QR is shown on the projector at the start, so it is public while the game runs.
    'universal_token', case when g.status in ('RUNNING', 'PAUSED')
                            then (select token from public.qr_codes where kind = 'universal') end,
    'total_rounds', (select count(*) from public.rounds),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', r.number, 'advance', r.advance_count, 'is_final', r.is_final, 'closed', r.closed_at is not null,
        'completed', (select count(*) from public.round_results x where x.round = r.number)) order by r.number)
      from public.rounds r), '[]'),
    'map', (select jsonb_build_object('path', v.image_path, 'w', v.width, 'h', v.height)
              from public.venue_map v where v.id = 1 and v.image_path is not null),
    'teams', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.sort_group, t.final_rank nulls last,
                       t.rounds_completed desc, t.last_completed_at nulls last, t.number)
      from (
        select tm.id, tm.number, tm.name, tm.status, tm.final_rank, tm.eliminated_in_round,
               ts.round, ts.phase, ts.penalty_ms, ts.penalty_until,
               (select count(*) from public.players p where p.team_id = tm.id) as members,
               (select count(*) from public.round_results r where r.team_id = tm.id) as rounds_completed,
               (select max(completed_at) from public.round_results r where r.team_id = tm.id) as last_completed_at,
               (select count(*) from public.checkins c join public.players p on p.id = c.player_id
                 where p.team_id = tm.id and c.round = ts.round and c.key_ok_at is not null) as checked_in,
               case tm.status when 'finished' then 0 when 'active' then 1 when 'eliminated' then 2 else 3 end as sort_group,
               (select jsonb_build_object(
                  'x', round((l.map_x + (get_byte(decode(md5(tm.id::text || rr.round || 'x'), 'hex'), 0) / 255.0 - 0.5)
                              * l.reveal_radius * 0.6)::numeric, 3),
                  'y', round((l.map_y + (get_byte(decode(md5(tm.id::text || rr.round || 'y'), 'hex'), 0) / 255.0 - 0.5)
                              * l.reveal_radius * 0.6)::numeric, 3),
                  'round', rr.round)
                  from public.round_results rr
                  join public.rounds rd on rd.number = rr.round and rd.closed_at is not null
                  join public.assignments a on a.team_id = rr.team_id and a.round = rr.round
                  join public.qr_codes c on c.id = a.qr_id
                  join public.locations l on l.id = c.location_id
                 where rr.team_id = tm.id and l.map_x is not null
                 order by rr.round desc limit 1) as ship,
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
