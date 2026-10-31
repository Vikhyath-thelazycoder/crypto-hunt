-- P10 (T-1001 … T-1004): the causes of the 2026-10-30 crash (43 crews, 171 phones, docs/reports/phase-10.md).
-- * Check-ins no longer share one queue: a check-in locks only its own round's row, and always the round before the crew.
-- * my_status is read-only; a crew's ended penalty is settled by that crew's phone or the next action, never in a queue.
-- * The leaderboard is rebuilt every 3 s by pg_cron, not by each player action; the admin's actions still show at once.
-- * Phones get empty "changed" pings on private channels instead of table changes, so nothing is sent to every phone
--   except a game-wide change. Realtime Postgres Changes is off: the admin page and projector read on a short timer.

-- ── Round lock (T-1001) ──────────────────────────────────────────────────────────────────────────────
-- Order everywhere: the round's row, then the crew's. p_only_phase makes a settle a no-op if the crew has moved on.
drop function public._complete_round(uuid, timestamptz);
create function public._complete_round(p_team uuid, p_at timestamptz default null, p_only_phase text default null) returns jsonb
language plpgsql set search_path = public as $$
declare
  ts public.team_state;
  rd public.rounds;
  r int;
  ord int;
begin
  select round into r from public.team_state where team_id = p_team;
  select * into rd from public.rounds where number = r for update;
  select * into ts from public.team_state where team_id = p_team for update;
  if ts.round <> r or (p_only_phase is not null and ts.phase <> p_only_phase) then
    return jsonb_build_object('completed', false, 'stale', true, 'round', ts.round);
  end if;
  if rd.closed_at is not null then
    perform public._eliminate(p_team, rd.number);
    perform public._maybe_finish();
    return jsonb_build_object('completed', false, 'eliminated', true, 'round', rd.number);
  end if;

  select coalesce(max(completion_order), 0) + 1 into ord from public.round_results where round = rd.number;
  insert into public.round_results (team_id, round, completed_at, completion_order)
  values (p_team, rd.number, coalesce(p_at, now()), ord);
  perform public._event(p_team, null, 'round_completed', jsonb_build_object('round', rd.number, 'order', ord));

  if rd.is_final then
    update public.teams set status = 'finished', final_rank = ord, completion_key = public._random_code(8)
     where id = p_team;
    update public.team_state set phase = 'FINISHED', updated_at = now() where team_id = p_team;
    delete from public.scan_tickets where player_id in (select id from public.players where team_id = p_team);
    perform public._event(p_team, null, 'finished', jsonb_build_object('rank', ord));
  end if;
  if ord >= rd.advance_count then
    perform public._close_round(rd.number);
  end if;
  if not rd.is_final then
    perform public._start_round(p_team, rd.number + 1);
  end if;
  perform public._maybe_finish();
  return jsonb_build_object('completed', true, 'round', rd.number, 'order', ord, 'final', rd.is_final);
end $$;

-- Only one action settles at a time; the others carry on instead of queuing behind it.
create or replace function public._settle_penalties() returns void
language plpgsql set search_path = public as $$
declare t record;
begin
  if (select status from public.games where id = 1) <> 'RUNNING' then return; end if;
  if not exists (select 1 from public.team_state where phase = 'PENALTY' and penalty_until <= now()) then return; end if;
  if not pg_try_advisory_xact_lock(7171718) then return; end if;
  for t in
    select team_id, penalty_until from public.team_state
     where phase = 'PENALTY' and penalty_until <= now()
     order by penalty_until
  loop
    perform public._complete_round(t.team_id, t.penalty_until, 'PENALTY');
  end loop;
end $$;

-- submit_key keeps its body: the wrapper takes the crew's round instead of one lock for the whole game.
create or replace function public.submit_key(p_token text, p_key text, p_seal_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r int;
begin
  select ts.round into r from public.team_state ts
    join public.players p on p.team_id = ts.team_id where p.user_id = auth.uid();
  if r is not null then perform 1 from public.rounds where number = r for update; end if;
  return public._submit_key_body(p_token, p_key, p_seal_code);
end $$;

-- A crew's own phone always settles its own penalty, whoever else is settling.
create or replace function public.complete_round() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  ts public.team_state;
  res jsonb;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status = 'PAUSED' then return public._fail('PAUSED'); end if;
  if g.status <> 'RUNNING' then return public._fail('NOT_RUNNING'); end if;
  select * into ts from public.team_state where team_id = p.team_id;
  if ts.phase <> 'PENALTY' then return public._fail('NOT_READY'); end if;
  if ts.penalty_until > now() then
    return public._fail('PENALTY_RUNNING', jsonb_build_object('until', ts.penalty_until));
  end if;
  perform public._settle_penalties();
  perform public._complete_round(p.team_id, ts.penalty_until, 'PENALTY');
  select jsonb_build_object('ok', true, 'phase', phase, 'round', round) into res
    from public.team_state where team_id = p.team_id;
  return res;
end $$;

-- ── Read-only status (T-1002) ────────────────────────────────────────────────────────────────────────
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
      'completion_key', case when t.status = 'finished' then t.completion_key end,
      -- D-044: the crew's first member names it once, before the hunt starts.
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
          -- D-033: the clue set drawn for this crew at this mark (T-507).
          (select cs.pieces[x.piece_index + 1] from public.assignments a
             join public.qr_codes c on c.id = a.qr_id
             join public.clue_sets cs on cs.location_id = c.location_id and cs.set_no = a.clue_set
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
    -- T-602: the regions of rounds already done stay lifted (same offset as when they were live).
    'visited', coalesce((select jsonb_agg(jsonb_build_object(
        'x', round((l.map_x + (get_byte(decode(md5(t.id::text || a.round || 'x'), 'hex'), 0) / 255.0 - 0.5)
                    * l.reveal_radius * 0.6)::numeric, 3),
        'y', round((l.map_y + (get_byte(decode(md5(t.id::text || a.round || 'y'), 'hex'), 0) / 255.0 - 0.5)
                    * l.reveal_radius * 0.6)::numeric, 3),
        'r', l.reveal_radius) order by a.round)
      from public.assignments a join public.qr_codes c on c.id = a.qr_id join public.locations l on l.id = c.location_id
      where a.team_id = t.id and a.round < ts.round and l.map_x is not null), '[]'),
    -- T-601: the venue map image (it has no pins; anyone may load it, D-034).
    'map', (select jsonb_build_object('path', v.image_path, 'w', v.width, 'h', v.height)
              from public.venue_map v where v.id = 1 and v.image_path is not null),
    -- D-026: the crew seal code, only in the final round once the final clue is complete.
    'seal_code', case when rd.is_final and pieces_solved = 4 then t.final_code end
  );
end $$;

-- ── Leaderboard every 3 s (T-1003) ───────────────────────────────────────────────────────────────────
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
                 (select jsonb_agg(p.name order by p.created_at) from public.players p where p.team_id = tm.id) end as crew
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

create or replace function public._refresh_public() returns void
language plpgsql set search_path = public as $$
begin
  if public.is_admin() then perform public._rebuild_public(); end if;
end $$;

create or replace function public._rebuild_public_tick() returns void
language plpgsql set search_path = public as $$
begin
  if (select status from public.games where id = 1) in ('REGISTRATION', 'READY', 'RUNNING', 'PAUSED') then
    perform public._rebuild_public();
  end if;
end $$;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('rebuild-public', '3 seconds', 'select public._rebuild_public_tick()');
select cron.schedule('trim-cron-log', '7 * * * *', $job$delete from cron.job_run_details where end_time < now() - interval '1 hour'$job$);

-- ── Pings instead of table changes (T-1004) ──────────────────────────────────────────────────────────
create function public._ping_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- A crew's only phone made this change itself and already knows.
  if exists (select 1 from public.players where team_id = p_team and user_id is distinct from auth.uid()) then
    perform realtime.send('{}'::jsonb, 'changed', 'team:' || p_team::text, true);
  end if;
end $$;

create function public._ping_team_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._ping_team(coalesce(new.team_id, old.team_id));
  return null;
end $$;

create function public._ping_team_self() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._ping_team(new.id);
  return null;
end $$;

create trigger ping_team after insert or update on public.team_state for each row execute function public._ping_team_row();
create trigger ping_team after update of status, final_rank, name on public.teams for each row execute function public._ping_team_self();
create trigger ping_team after insert or delete or update of is_active on public.players for each row execute function public._ping_team_row();
create trigger ping_team after update on public.assignments for each row execute function public._ping_team_row();

create function public._ping_game_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'game', true);
  return null;
end $$;
create trigger ping_game after update of status, broadcast_at, hints_enabled, registration_open on public.games
  for each row execute function public._ping_game_trigger();

create policy player_topics on realtime.messages for select to authenticated
  using (realtime.topic() = 'game' or realtime.topic() = 'team:' || public.my_team_id()::text);

alter publication supabase_realtime drop table
  public.public_state, public.team_state, public.events, public.alerts, public.teams, public.players, public.round_results;

revoke execute on function public._complete_round(uuid, timestamptz, text), public._settle_penalties(),
  public._rebuild_public(), public._rebuild_public_tick(), public._refresh_public(), public._ping_team(uuid),
  public._ping_team_row(), public._ping_team_self(), public._ping_game_trigger()
  from public, anon, authenticated;
grant execute on function public._rebuild_public() to service_role;
revoke execute on function public.submit_key(text, text, text), public.complete_round() from public, anon;
grant execute on function public.submit_key(text, text, text), public.complete_round() to authenticated;
