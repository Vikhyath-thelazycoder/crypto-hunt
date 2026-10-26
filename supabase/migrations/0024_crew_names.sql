-- D-044: crews name themselves. The first member to join a crew (with its team code) names it once, before the
-- hunt starts: 2–24 characters (letters, digits, spaces and ' & . -), unique ignoring case. The other members see it
-- on their phones, and it shows on the admin dashboard and the projector. The captain's rename (rename_team) still
-- works at any time and locks the name, e.g. to replace an unsuitable one.

alter table public.teams add column named boolean not null default false;

create function public.name_crew(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  t public.teams;
  first_id uuid;
  n text;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status in ('RUNNING', 'PAUSED', 'FINISHED') then return public._fail('GAME_STARTED'); end if;
  select * into t from public.teams where id = p.team_id for update;
  if t.named then return public._fail('ALREADY_NAMED', jsonb_build_object('name', t.name)); end if;
  select f.id into first_id from public.players f where f.team_id = t.id and f.is_active
   order by f.created_at, f.id limit 1;
  if first_id is distinct from p.id then return public._fail('NOT_FIRST'); end if;
  if public._hit('p:' || p.id, 'name_crew', 60) > 10 then return public._fail('RATE_LIMITED'); end if;
  n := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if n !~ '^[A-Za-z0-9][A-Za-z0-9 ''&.-]{1,23}$' then return public._fail('BAD_CREW_NAME'); end if;
  if exists (select 1 from public.teams o where lower(o.name) = lower(n) and o.id <> t.id) then
    return public._fail('CREW_NAME_TAKEN');
  end if;
  update public.teams set name = n, named = true where id = t.id;
  perform public._event(t.id, p.id, 'crew_named', jsonb_build_object('name', n));
  perform public._refresh_public();
  return jsonb_build_object('ok', true, 'name', n);
end $$;
revoke execute on function public.name_crew(text) from public, anon, authenticated;
grant execute on function public.name_crew(text) to authenticated;

-- The captain's rename also locks the name, so the crew can't change it back.
create or replace function public.rename_team(p_team uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update public.teams set name = btrim(p_name), named = true where id = p_team;
  if not found then raise exception 'NO_TEAM'; end if;
  perform public._audit('rename_team', p_team::text, null, jsonb_build_object('name', p_name));
  perform public._refresh_public();
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

