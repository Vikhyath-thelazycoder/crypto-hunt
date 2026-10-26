-- T-507 (D-033, D-039): each place keeps up to 3 clue sets of 4 pieces + a hint. Every assignment of a crew to a
-- mark draws one set: the set rotates with each New Game (round-robin over the place's complete sets), and crews
-- sharing a mark in the same round get different sets while the place has enough. The pick happens in a trigger, so
-- every path that routes a crew (apply_game_plan, Start after New Game, re-point) gets it. Players only ever see the
-- pieces they solved, through my_status (as before).

create table public.clue_sets (
  location_id uuid not null references public.locations (id) on delete cascade,
  set_no int not null check (set_no between 1 and 3),
  pieces text[] not null check (cardinality(pieces) = 4),
  hint text check (char_length(hint) <= 300),
  primary key (location_id, set_no)
);
alter table public.clue_sets enable row level security;
revoke all on public.clue_sets from public, anon, authenticated;
grant select, insert, update, delete on public.clue_sets to authenticated;
create policy admin_read on public.clue_sets for select to authenticated using (public.is_admin());
create policy admin_write on public.clue_sets for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Clues written so far become set 1.
insert into public.clue_sets (location_id, set_no, pieces, hint)
  select id, 1, clue_pieces, hint from public.locations
   where hint is not null or exists (select 1 from unnest(clue_pieces) p where btrim(p) <> '');

alter table public.assignments add column clue_set int check (clue_set between 1 and 3);

create function public._pick_clue_set() returns trigger
language plpgsql set search_path = public as $$
declare
  loc uuid;
  sets int[];
  base int;
  k int;
begin
  select location_id into loc from public.qr_codes where id = new.qr_id;
  -- Complete sets first; a place still being written falls back to whatever sets it has.
  select array_agg(set_no order by set_no) into sets from public.clue_sets
   where location_id = loc and not exists (select 1 from unnest(pieces) p where btrim(p) = '');
  if sets is null then
    select array_agg(set_no order by set_no) into sets from public.clue_sets where location_id = loc;
  end if;
  if sets is null then
    new.clue_set := null;
    return new;
  end if;
  -- Games played so far (the audit log is kept across games, D-027) and crews already on this mark this round.
  select count(*) into base from public.admin_audit where action = 'start_new_game';
  select count(*) into k from public.assignments
   where qr_id = new.qr_id and round = new.round and team_id <> new.team_id;
  new.clue_set := sets[((base + k) % cardinality(sets)) + 1];
  return new;
end $$;
revoke execute on function public._pick_clue_set() from public, anon, authenticated;

create trigger assignments_clue_set before insert or update of qr_id on public.assignments
  for each row execute function public._pick_clue_set();

-- Routes already drawn get their set now.
update public.assignments set qr_id = qr_id where true;

alter table public.locations drop column clue_pieces, drop column hint;

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
    -- D-026: the crew seal code, only in the final round once the final clue is complete.
    'seal_code', case when rd.is_final and pieces_solved = 4 then t.final_code end
  );
end $$;

