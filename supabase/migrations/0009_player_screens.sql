-- Phase 3 needs, from the player screens (docs/design/screens):
-- * Join previews the crew for a code before joining ("Iron Gulls · 2 of 4 aboard"): team_preview, service role
--   only, rate-limited per IP like joins.
-- * my_status adds the team code (Lobby "share this code"), the question's category and difficulty (Solve card),
--   and who holds each clue piece (Solve piece grid).
-- * Completion keys are 9 characters, shown as 7QX·4MD·KP2 on the Victory screen.

create or replace function public.team_preview(p_code text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if public._hit('ip:' || coalesce(p_ip, '?'), 'join', 60) > 60 then return public._fail('RATE_LIMITED'); end if;
  select * into t from public.teams where code = upper(btrim(coalesce(p_code, '')));
  if not found then return public._fail('BAD_CODE'); end if;
  return jsonb_build_object('ok', true, 'team', jsonb_build_object('name', t.name, 'number', t.number,
    'status', t.status,
    'members', (select coalesce(jsonb_agg(left(m.name, 1) order by m.created_at), '[]') from public.players m where m.team_id = t.id)));
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
      'options', case when my.opened_at is not null then q.options end,
      'hint', case when my.hint_used then q.hint end,
      'category', case when my.opened_at is not null then q.category end,
      'difficulty', q.difficulty,
      'piece_index', my.piece_index,
      'has_hint', q.hint is not null) end,
    'pieces', coalesce((select jsonb_agg(jsonb_build_object(
        'index', x.piece_index, 'solved', x.solved_at is not null,
        'by', (select m.name from public.players m where m.id = x.player_id), 'mine', x.player_id = p.id,
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

create or replace function public._complete_round(p_team uuid, p_at timestamptz default null) returns jsonb
language plpgsql set search_path = public as $$
declare
  ts public.team_state;
  rd public.rounds;
  ord int;
begin
  select * into ts from public.team_state where team_id = p_team for update;
  select * into rd from public.rounds where number = ts.round for update;
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
    update public.teams set status = 'finished', final_rank = ord, completion_key = public._random_code(9)
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

revoke execute on function public.team_preview(text, text) from public, anon, authenticated;
grant execute on function public.team_preview(text, text) to service_role;
