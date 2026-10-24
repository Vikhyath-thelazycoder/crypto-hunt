-- Internal helpers of the game engine (SYSTEM_WORKFLOW.md). None is callable by clients (no grants).

-- ── Random secrets (SECURITY.md T5) ─────────────────────────────────────────────────────────────────
-- Key alphabet without look-alikes (0/O, 1/I). 32 symbols, so a random byte mod 32 is unbiased.
create function public._random_code(p_len int) returns text
language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 32) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(p_len) as b) s, generate_series(0, p_len - 1) as i;
$$;

-- 24 random bytes, base64url: what a printed QR encodes.
create function public._token() returns text
language sql volatile set search_path = public, extensions as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;

-- Constant-time-ish comparison: both sides hashed, so timing doesn't reveal a matching prefix.
create function public._key_eq(p_secret text, p_given text) returns boolean
language sql immutable set search_path = public, extensions as $$
  select p_secret is not null and p_given is not null
    and extensions.digest(upper(p_secret), 'sha256')
      = extensions.digest(upper(regexp_replace(p_given, '[^A-Za-z0-9]', '', 'g')), 'sha256');
$$;

-- ── Rate limits, events, alerts ─────────────────────────────────────────────────────────────────────
-- Counts hits in a fixed window and returns the count including this one.
create function public._hit(p_subject text, p_bucket text, p_window_s int) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  insert into public.rate_limits (subject, bucket, window_start, count) values (p_subject, p_bucket, now(), 1)
  on conflict (subject, bucket) do update set
    count = case when rate_limits.window_start < now() - make_interval(secs => p_window_s) then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_s) then now() else rate_limits.window_start end
  returning count into n;
  return n;
end $$;

create function public._event(p_team uuid, p_player uuid, p_kind text, p_data jsonb default '{}') returns void
language sql set search_path = public as $$
  insert into public.events (team_id, player_id, kind, data) values (p_team, p_player, p_kind, coalesce(p_data, '{}'));
$$;

create function public._alert(p_team uuid, p_player uuid, p_kind text, p_data jsonb default '{}') returns void
language sql set search_path = public as $$
  insert into public.alerts (team_id, player_id, kind, data) values (p_team, p_player, p_kind, coalesce(p_data, '{}'));
  insert into public.events (team_id, player_id, kind, data) values (p_team, p_player, 'alert:' || p_kind, coalesce(p_data, '{}'));
$$;

-- ── Answers (TRD › Answer matching) ─────────────────────────────────────────────────────────────────
create function public._norm(p text) returns text
language sql stable set search_path = public, extensions as $$
  select lower(extensions.unaccent(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')));
$$;

create function public._answer_ok(p_q public.questions, p_answer text) returns boolean
language plpgsql stable set search_path = public as $$
declare cand text;
begin
  if p_answer is null or btrim(p_answer) = '' then return false; end if;
  if p_q.format = 'mcq' then
    return btrim(p_answer) = btrim(p_q.answer);
  end if;
  foreach cand in array array_prepend(p_q.answer, p_q.alternatives) loop
    if p_q.format = 'number'
       and btrim(p_answer) ~ '^-?[0-9]+(\.[0-9]+)?$' and btrim(cand) ~ '^-?[0-9]+(\.[0-9]+)?$' then
      if btrim(p_answer)::numeric = btrim(cand)::numeric then return true; end if;
    elsif public._norm(p_answer) = public._norm(cand) then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- ── Player context (one active session per player, D-005) ───────────────────────────────────────────
create function public._ctx() returns public.players
language plpgsql stable security definer set search_path = public as $$
declare p public.players;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into p from public.players where user_id = auth.uid();
  if not found or p.session_id is null then raise exception 'NOT_REGISTERED'; end if;
  if nullif(auth.jwt() ->> 'session_id', '')::uuid is distinct from p.session_id then
    raise exception 'SESSION_MOVED';
  end if;
  return p;
end $$;

create function public._admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return auth.uid();
end $$;

create function public._audit(p_action text, p_target text, p_reason text, p_data jsonb default '{}') returns void
language sql set search_path = public as $$
  insert into public.admin_audit (admin_id, action, target, reason, data)
  values (auth.uid(), p_action, p_target, p_reason, coalesce(p_data, '{}'));
$$;

-- ── Rounds ──────────────────────────────────────────────────────────────────────────────────────────
-- A random enabled question the team hasn't seen, as close to the round's difficulty as possible.
create function public._pick_question(p_team uuid, p_difficulty int) returns uuid
language sql volatile set search_path = public as $$
  select q.id from public.questions q
  where q.is_enabled
    and not exists (select 1 from public.tasks t where t.team_id = p_team and t.question_id = q.id)
  order by abs(q.difficulty - p_difficulty), random()
  limit 1;
$$;

-- One question per active member, 4 pieces in all; pieces with no active member left are merged (unlocked).
create function public._create_tasks(p_team uuid, p_round int, p_opened boolean) returns void
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
    insert into public.tasks (team_id, player_id, round, question_id, piece_index, opened_at)
    values (p_team, m.id, p_round, q, piece, case when p_opened then now() end);
    piece := piece + 1;
  end loop;
  while piece < 4 loop
    insert into public.tasks (team_id, player_id, round, piece_index, opened_at, solved_at)
    values (p_team, null, p_round, piece, now(), now());
    piece := piece + 1;
  end loop;
end $$;

create function public._start_round(p_team uuid, p_round int) returns void
language plpgsql set search_path = public as $$
begin
  delete from public.scan_tickets where player_id in (select id from public.players where team_id = p_team);
  update public.team_state
     set round = p_round, phase = 'SOLVING', penalty_ms = 0, penalty_until = null,
         round_started_at = now(), locked_scans = 0, updated_at = now()
   where team_id = p_team;
  if not exists (select 1 from public.tasks where team_id = p_team and round = p_round) then
    perform public._create_tasks(p_team, p_round, p_round > 1);
  end if;
  perform public._event(p_team, null, 'round_started', jsonb_build_object('round', p_round));
end $$;

create function public._eliminate(p_team uuid, p_round int) returns void
language plpgsql set search_path = public as $$
begin
  update public.teams set status = 'eliminated', eliminated_in_round = p_round
   where id = p_team and status = 'active';
  update public.team_state set phase = 'ELIMINATED', updated_at = now() where team_id = p_team;
  delete from public.scan_tickets where player_id in (select id from public.players where team_id = p_team);
  perform public._event(p_team, null, 'eliminated', jsonb_build_object('round', p_round));
end $$;

create function public._maybe_finish() returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.teams where status = 'active') then
    update public.games set status = 'FINISHED', finished_at = now(), end_reason = coalesce(end_reason, 'complete')
     where id = 1 and status in ('RUNNING', 'PAUSED');
  end if;
end $$;

-- Round close (D-012): every team still racing that hasn't completed round r is eliminated, instantly.
create function public._close_round(p_round int) returns void
language plpgsql set search_path = public as $$
declare t record;
begin
  update public.rounds set closed_at = now() where number = p_round and closed_at is null;
  for t in
    select tm.id from public.teams tm join public.team_state ts on ts.team_id = tm.id
    where tm.status = 'active' and ts.round <= p_round
      and not exists (select 1 from public.round_results r where r.team_id = tm.id and r.round = p_round)
  loop
    perform public._eliminate(t.id, p_round);
  end loop;
  perform public._event(null, null, 'round_closed', jsonb_build_object('round', p_round));
end $$;

-- SYSTEM_WORKFLOW › Round close and elimination. Caller holds no locks; this takes them in a fixed order.
create function public._complete_round(p_team uuid, p_at timestamptz default null) returns jsonb
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

-- Teams whose hint penalty has run out complete in the order their penalties ended (completion time =
-- check-in + penalty), even if no phone asked yet.
create function public._settle_penalties() returns void
language plpgsql set search_path = public as $$
declare t record;
begin
  if (select status from public.games where id = 1) <> 'RUNNING' then return; end if;
  for t in
    select team_id, penalty_until from public.team_state
    where phase = 'PENALTY' and penalty_until <= now()
    order by penalty_until
  loop
    perform public._complete_round(t.team_id, t.penalty_until);
  end loop;
end $$;

-- After any check-in or roster change: all active members in → penalty or complete.
create function public._check_team_in(p_team uuid) returns text
language plpgsql set search_path = public as $$
declare
  ts public.team_state;
  active int;
  done int;
begin
  select * into ts from public.team_state where team_id = p_team for update;
  if ts.phase not in ('SEEKING', 'CHECKING_IN') then return ts.phase; end if;
  select count(*) into active from public.players where team_id = p_team and is_active;
  select count(*) into done from public.checkins c join public.players p on p.id = c.player_id
   where p.team_id = p_team and p.is_active and c.round = ts.round and c.key_ok_at is not null;
  if active = 0 or done < active then return ts.phase; end if;
  if ts.penalty_ms > 0 then
    update public.team_state
       set phase = 'PENALTY', penalty_until = now() + make_interval(secs => ts.penalty_ms / 1000.0), updated_at = now()
     where team_id = p_team;
    perform public._event(p_team, null, 'penalty_started', jsonb_build_object('ms', ts.penalty_ms));
    return 'PENALTY';
  end if;
  perform public._complete_round(p_team);
  return 'COMPLETED';
end $$;

-- After a piece is solved or merged: all four → SEEKING, and in the final round the crew's seal code (D-026),
-- unique across teams. Returns the number of solved pieces.
create function public._after_piece(p_team uuid) returns int
language plpgsql set search_path = public as $$
declare
  ts public.team_state;
  solved int;
begin
  select * into ts from public.team_state where team_id = p_team for update;
  select count(*) into solved from public.tasks where team_id = p_team and round = ts.round and solved_at is not null;
  if solved < 4 or ts.phase <> 'SOLVING' then return solved; end if;
  update public.team_state set phase = 'SEEKING', updated_at = now() where team_id = p_team;
  if (select is_final from public.rounds where number = ts.round) then
    loop
      begin
        update public.teams set final_code = public._random_code(6) where id = p_team and final_code is null;
        exit;
      exception when unique_violation then
        null; -- astronomically rare; draw again
      end;
    end loop;
  end if;
  perform public._event(p_team, null, 'clue_complete', jsonb_build_object('round', ts.round));
  return solved;
end $$;

-- ── Public state (leaderboard + ships; names and progress only) ─────────────────────────────────────
create function public._refresh_public() returns void
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
               case tm.status when 'finished' then 0 when 'active' then 1 when 'eliminated' then 2 else 3 end as sort_group
        from public.teams tm left join public.team_state ts on ts.team_id = tm.id
      ) t), '[]')
  ) into d;
  update public.public_state set data = d, event_seq = event_seq + 1, updated_at = now() where id = 1;
end $$;

-- Paths for teams without one (after New Game reuses the printed QRs): a distinct random round-1 QR each,
-- then follow the links.
create function public._assign_paths() returns void
language plpgsql set search_path = public as $$
declare
  t record;
  q uuid;
  r int;
  rounds_n int;
begin
  select count(*) into rounds_n from public.rounds;
  for t in select id from public.teams tm where not exists (select 1 from public.assignments a where a.team_id = tm.id) order by number loop
    select id into q from public.qr_codes c
     where c.round = 1 and not exists (select 1 from public.assignments a where a.qr_id = c.id and a.round = 1)
     order by random() limit 1;
    if q is null then raise exception 'NOT_ENOUGH_ROUND_ONE_QRS'; end if;
    for r in 1..rounds_n loop
      insert into public.assignments (team_id, round, qr_id) values (t.id, r, q);
      if r < rounds_n then select to_qr into q from public.qr_links where from_qr = q; end if;
    end loop;
  end loop;
  update public.qr_codes c set is_spare = (c.round = 1 and not exists (select 1 from public.assignments a where a.qr_id = c.id))
   where c.round = 1;
end $$;
