-- Player RPCs (TRD.md › APIs, SYSTEM_WORKFLOW.md). Guard failures (not signed in, not registered, session
-- moved) raise. Game outcomes return {ok: false, code} instead of raising, so the alerts and rate-limit
-- counters they write are kept (a raise would roll them back).

create function public._fail(p_code text, p_extra jsonb default '{}') returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', false, 'code', p_code) || p_extra $$;

-- ── Join (called only by the player-join Edge Function with the service role) ───────────────────────
create function public.join_preflight(p_name text, p_code text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  t public.teams;
  existing uuid;
  members int;
begin
  if public._hit('ip:' || coalesce(p_ip, '?'), 'join', 60) > 60 then return public._fail('RATE_LIMITED'); end if;
  if p_name is null or btrim(p_name) !~ '^[[:alnum:] .''_-]{2,40}$' then return public._fail('BAD_NAME'); end if;
  select * into g from public.games where id = 1;
  if g.status = 'FINISHED' then return public._fail('REGISTRATION_CLOSED'); end if;
  select * into t from public.teams where code = upper(btrim(coalesce(p_code, '')));
  if not found then return public._fail('BAD_CODE'); end if;
  if t.status in ('eliminated', 'disqualified', 'finished') then return public._fail('TEAM_LOCKED'); end if;
  -- Same name in the same team: this member is moving to a new phone (T11, alerted on commit).
  select user_id into existing from public.players where team_id = t.id and lower(btrim(name)) = lower(btrim(p_name));
  if existing is not null then
    return jsonb_build_object('ok', true, 'user_id', existing, 'takeover', true);
  end if;
  if not g.registration_open then return public._fail('REGISTRATION_CLOSED'); end if;
  select count(*) into members from public.players where team_id = t.id;
  if t.status <> 'forming' or members >= 4 then return public._fail('TEAM_FULL'); end if;
  return jsonb_build_object('ok', true, 'user_id', null, 'takeover', false);
end $$;

create function public.join_commit(p_user_id uuid, p_name text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  t public.teams;
  p public.players;
  members int;
  nonce text := public._token();
begin
  select * into g from public.games where id = 1;
  select * into t from public.teams where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then return public._fail('BAD_CODE'); end if;
  select * into p from public.players where team_id = t.id and lower(btrim(name)) = lower(btrim(p_name));
  if found then
    if p.user_id <> p_user_id then return public._fail('NAME_TAKEN'); end if;
    update public.players set claim_nonce = nonce, claim_expires_at = now() + interval '10 minutes' where id = p.id;
    perform public._alert(t.id, p.id, 'session_moved', jsonb_build_object('name', p.name));
  else
    if not g.registration_open or g.status = 'FINISHED' then return public._fail('REGISTRATION_CLOSED'); end if;
    select count(*) into members from public.players where team_id = t.id;
    if t.status <> 'forming' or members >= 4 then return public._fail('TEAM_FULL'); end if;
    insert into public.players (team_id, user_id, name, claim_nonce, claim_expires_at)
    values (t.id, p_user_id, btrim(p_name), nonce, now() + interval '10 minutes')
    returning * into p;
    if members + 1 = 4 then update public.teams set status = 'locked' where id = t.id; end if;
    perform public._event(t.id, p.id, 'joined', jsonb_build_object('name', p.name, 'members', members + 1));
    perform public._refresh_public();
  end if;
  return jsonb_build_object('ok', true, 'claim_nonce', nonce,
    'team', jsonb_build_object('name', t.name, 'number', t.number), 'player_id', p.id);
end $$;

-- The phone that verified the one-time login claims the player's session; any other phone is logged out.
create function public.claim_session(p_nonce text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if auth.uid() is null or sid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into p from public.players where user_id = auth.uid() for update;
  if not found then raise exception 'NOT_REGISTERED'; end if;
  if p.claim_nonce is null or p.claim_expires_at < now() or not public._key_eq(p.claim_nonce, p_nonce) then
    return public._fail('BAD_CLAIM');
  end if;
  update public.players set session_id = sid, claim_nonce = null, claim_expires_at = null where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

-- ── Status ──────────────────────────────────────────────────────────────────────────────────────────
create function public.my_status() returns jsonb
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
      'final_rank', t.final_rank, 'eliminated_in_round', t.eliminated_in_round, 'eliminated_view', t.eliminated_view,
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
      'has_hint', q.hint is not null) end,
    'pieces', coalesce((select jsonb_agg(jsonb_build_object(
        'index', x.piece_index, 'solved', x.solved_at is not null,
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

-- ── Scan (D-025 round lock) ─────────────────────────────────────────────────────────────────────────
create function public.scan_qr(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  t public.teams;
  ts public.team_state;
  q public.qr_codes;
  own boolean;
  n int;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status = 'PAUSED' then return public._fail('PAUSED'); end if;
  if g.status <> 'RUNNING' then return public._fail('NOT_RUNNING'); end if;
  select * into t from public.teams where id = p.team_id;
  if t.status in ('eliminated', 'disqualified') then return public._fail('ELIMINATED'); end if;
  if t.status = 'finished' then return public._fail('FINISHED'); end if;
  if not p.is_active then return public._fail('INACTIVE'); end if;
  if public._hit('p:' || p.id, 'scan', 60) > 30 then return public._fail('RATE_LIMITED'); end if;

  perform public._settle_penalties();
  select * into ts from public.team_state where team_id = t.id for update;
  select * into q from public.qr_codes where token = btrim(coalesce(p_token, ''));
  if not found then
    perform public._event(t.id, p.id, 'bad_qr');
    if public._hit('p:' || p.id, 'bad_qr', 600) = 3 then perform public._alert(t.id, p.id, 'bad_qr', '{}'); end if;
    return public._fail('BAD_QR');
  end if;

  if q.kind = 'prank' then
    perform public._alert(t.id, p.id, 'prank', jsonb_build_object('qr', q.label, 'round', ts.round));
    perform public._refresh_public();
    return jsonb_build_object('ok', true, 'result', 'PRANK', 'round', ts.round, 'fake_key', public._random_code(6));
  end if;

  if q.kind = 'universal' then
    if ts.round <> 1 then return public._fail('ALREADY_DONE'); end if;
    update public.tasks set opened_at = coalesce(opened_at, now()) where player_id = p.id and round = 1;
    perform public._event(t.id, p.id, 'opened_round_one');
    return jsonb_build_object('ok', true, 'result', 'QUESTION');
  end if;

  if q.round < ts.round then return public._fail('ALREADY_DONE'); end if;
  own := exists (select 1 from public.assignments a where a.team_id = t.id and a.round = q.round and a.qr_id = q.id);

  -- A later round's mark: same answer whether or not it's on this team's path; no ticket, nothing stored.
  if q.round > ts.round then
    update public.team_state set locked_scans = locked_scans + 1 where team_id = t.id returning locked_scans into n;
    perform public._alert(t.id, p.id, 'locked_scan', jsonb_build_object(
      'qr', q.label, 'qr_round', q.round, 'team_round', ts.round, 'own_future', own));
    if n = 3 then
      perform public._alert(t.id, p.id, 'possible_sweep', jsonb_build_object('round', ts.round, 'count', n));
    end if;
    return public._fail('LOCKED_MARK', jsonb_build_object('round', ts.round));
  end if;

  if not own then
    perform public._alert(t.id, p.id, 'wrong_team', jsonb_build_object('qr', q.label, 'round', q.round,
      'owners', (select coalesce(jsonb_agg(tm.name), '[]') from public.assignments a join public.teams tm on tm.id = a.team_id
                  where a.qr_id = q.id and a.round = q.round), 'spare', q.is_spare));
    return public._fail('NOT_YOURS');
  end if;
  if ts.phase = 'SOLVING' then
    perform public._event(t.id, p.id, 'found_early', jsonb_build_object('qr', q.label));
    return public._fail('SOLVE_FIRST');
  end if;
  if ts.phase not in ('SEEKING', 'CHECKING_IN') then return public._fail('ALREADY_DONE'); end if;
  if exists (select 1 from public.checkins where player_id = p.id and round = ts.round and key_ok_at is not null) then
    return public._fail('ALREADY_CHECKED_IN');
  end if;

  insert into public.checkins (player_id, round, qr_id) values (p.id, ts.round, q.id)
  on conflict (player_id, round) do update set qr_id = excluded.qr_id, scanned_at = now();
  insert into public.scan_tickets (player_id, qr_id, round) values (p.id, q.id, ts.round)
  on conflict (player_id) do update
    set qr_id = excluded.qr_id, round = excluded.round, issued_at = now(), expires_at = now() + interval '10 minutes';
  if ts.phase = 'SEEKING' then
    update public.team_state set phase = 'CHECKING_IN', updated_at = now() where team_id = t.id;
  end if;
  perform public._event(t.id, p.id, 'scanned', jsonb_build_object('qr', q.label));
  perform public._refresh_public();
  return jsonb_build_object('ok', true,
    'result', case when q.kind = 'final' then 'ASK_KEY_AND_SEAL' else 'ASK_KEY' end, 'qr', q.label);
end $$;

-- ── Answer and hint ─────────────────────────────────────────────────────────────────────────────────
create function public.submit_answer(p_task_id uuid, p_answer text) returns jsonb
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

create function public.use_hint(p_task_id uuid) returns jsonb
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
  if q.hint is null then return public._fail('NO_HINT'); end if;
  update public.tasks set hint_used = true where id = tk.id;
  update public.team_state set penalty_ms = penalty_ms + g.hint_penalty_ms, updated_at = now()
   where team_id = p.team_id returning penalty_ms into total;
  perform public._event(p.team_id, p.id, 'hint', jsonb_build_object('round', ts.round, 'penalty_ms', total));
  perform public._refresh_public();
  return jsonb_build_object('ok', true, 'hint', q.hint, 'penalty_ms', total);
end $$;

-- ── Check in: key (+ seal code at the final mark) ───────────────────────────────────────────────────
create function public.submit_key(p_token text, p_key text, p_seal_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  g public.games;
  t public.teams;
  ts public.team_state;
  q public.qr_codes;
  tk public.scan_tickets;
  n int;
  phase text;
  thief uuid;
begin
  p := public._ctx();
  select * into g from public.games where id = 1;
  if g.status = 'PAUSED' then return public._fail('PAUSED'); end if;
  if g.status <> 'RUNNING' then return public._fail('NOT_RUNNING'); end if;
  select * into t from public.teams where id = p.team_id;
  if t.status <> 'active' then return public._fail('ELIMINATED'); end if;
  if not p.is_active then return public._fail('INACTIVE'); end if;

  n := public._hit('p:' || p.id, 'key', 60);
  if n > 5 then
    if n = 6 then perform public._alert(t.id, p.id, 'key_spam', '{}'); end if;
    return public._fail('RATE_LIMITED');
  end if;

  perform public._settle_penalties();
  select * into q from public.qr_codes where token = btrim(coalesce(p_token, ''));
  if not found then return public._fail('BAD_QR'); end if;
  select * into ts from public.team_state where team_id = t.id for update;
  select * into tk from public.scan_tickets where player_id = p.id;

  -- D-025: only a ticket from scanning the team's own current-round QR opens the key check.
  if tk.player_id is null or tk.qr_id <> q.id or tk.round <> ts.round or tk.expires_at < now() then
    if q.round is not null and q.round > ts.round then
      perform public._alert(t.id, p.id, 'locked_key', jsonb_build_object('qr', q.label, 'qr_round', q.round,
        'team_round', ts.round,
        'own_future', exists (select 1 from public.assignments a where a.team_id = t.id and a.qr_id = q.id and a.round = q.round)));
      return public._fail('LOCKED_MARK', jsonb_build_object('round', ts.round));
    end if;
    return public._fail('NOT_SCANNED');
  end if;
  if ts.phase not in ('SEEKING', 'CHECKING_IN') then return public._fail('ALREADY_DONE'); end if;

  if not public._key_eq(q.key, p_key) then
    if public._hit('p:' || p.id, 'bad_key:' || ts.round, 3600) = 5 then
      perform public._alert(t.id, p.id, 'bad_keys', jsonb_build_object('qr', q.label, 'count', 5));
    end if;
    return public._fail('BAD_KEY');
  end if;

  if q.kind = 'final' then
    if not public._key_eq(t.final_code, p_seal_code) then
      select id into thief from public.teams
       where id <> t.id and public._key_eq(final_code, p_seal_code);
      if thief is not null then
        perform public._alert(t.id, p.id, 'foreign_seal', jsonb_build_object('code_of_team',
          (select name from public.teams where id = thief)));
      end if;
      return public._fail('BAD_SEAL');
    end if;
  end if;

  update public.checkins set key_ok_at = now(), seal_ok_at = case when q.kind = 'final' then now() end
   where player_id = p.id and round = ts.round;
  delete from public.scan_tickets where player_id = p.id;
  perform public._event(t.id, p.id, 'checked_in', jsonb_build_object('qr', q.label, 'round', ts.round));
  phase := public._check_team_in(t.id);
  perform public._refresh_public();
  return jsonb_build_object('ok', true, 'checked_in', true, 'phase', phase,
    'team_count', (select count(*) from public.checkins c join public.players m on m.id = c.player_id
                    where m.team_id = t.id and m.is_active and c.round = ts.round and c.key_ok_at is not null));
end $$;

create function public.complete_round() returns jsonb
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
  perform public._refresh_public();
  select jsonb_build_object('ok', true, 'phase', phase, 'round', round) into res
    from public.team_state where team_id = p.team_id;
  return res;
end $$;

-- ── Anti-cheat and eliminated view ──────────────────────────────────────────────────────────────────
create function public.report_focus_event(p_task_id uuid, p_kind text, p_away_ms int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  tk public.tasks;
begin
  p := public._ctx();
  if p_kind not in ('hidden', 'blur', 'pagehide') then return public._fail('BAD_KIND'); end if;
  select * into tk from public.tasks where id = p_task_id for update;
  if not found or tk.player_id is distinct from p.id then return public._fail('NOT_YOUR_TASK'); end if;
  if tk.solved_at is not null or tk.focus_events >= 50 then return jsonb_build_object('ok', true, 'received', false); end if;
  update public.tasks set focus_events = focus_events + 1 where id = tk.id;
  perform public._alert(p.team_id, p.id, 'left_site', jsonb_build_object('kind', p_kind,
    'away_ms', greatest(0, least(coalesce(p_away_ms, 0), 86400000)), 'round', tk.round));
  return jsonb_build_object('ok', true, 'received', true);
end $$;

create function public.set_eliminated_view(p_view text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  p := public._ctx();
  if p_view not in ('game_over', 'spectator') then return public._fail('BAD_VIEW'); end if;
  update public.teams set eliminated_view = p_view where id = p.team_id and status in ('eliminated', 'disqualified');
  if not found then return public._fail('NOT_ELIMINATED'); end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function
  public.claim_session(text), public.my_status(), public.scan_qr(text), public.submit_answer(uuid, text),
  public.use_hint(uuid), public.submit_key(text, text, text), public.complete_round(),
  public.report_focus_event(uuid, text, int), public.set_eliminated_view(text)
to authenticated;
grant execute on function public.join_preflight(text, text, text), public.join_commit(uuid, text, text) to service_role;
