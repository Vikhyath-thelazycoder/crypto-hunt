-- Phase 4 needs, from the admin mockups (docs/design/screens: AdminDashboard, Generator, MapEditor):
-- * The venue map image lives in Storage (bucket "venue"). Anyone may download it (the image has no pins; the
--   phones' map needs it in P6); only the admin uploads, replaces or deletes (T-403).
-- * admin_snapshot(): the whole live dashboard in one consistent read (crews with progress and members, rounds,
--   open alerts with the place behind each mark, the ship's log, course and question counts). Admin only.
-- * ack_all_alerts(): clear the alerts rail in one click.

-- ── Venue map storage ───────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue', 'venue', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists venue_admin_select on storage.objects;
drop policy if exists venue_admin_insert on storage.objects;
drop policy if exists venue_admin_update on storage.objects;
drop policy if exists venue_admin_delete on storage.objects;
create policy venue_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'venue' and public.is_admin());
create policy venue_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'venue' and public.is_admin());
create policy venue_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'venue' and public.is_admin()) with check (bucket_id = 'venue' and public.is_admin());
create policy venue_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'venue' and public.is_admin());

-- ── Live dashboard ──────────────────────────────────────────────────────────────────────────────────
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
      'hints_enabled', g.hints_enabled, 'hint_penalty_ms', g.hint_penalty_ms, 'mcq_lockout_ms', g.mcq_lockout_ms,
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

create or replace function public.ack_all_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._admin();
  update public.alerts set acknowledged = true where not acknowledged;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.admin_snapshot(), public.ack_all_alerts() from public, anon, authenticated;
grant execute on function public.admin_snapshot(), public.ack_all_alerts() to authenticated;
