-- D-046: a new game starts from zero crews unless the captain keeps them, and the Crews page sets the TOTAL number
-- of crews. Before, New Game always kept the crews (new codes) and "Create 10" always added 10 more, so after a
-- 27-crew game the next game had 37.
--   start_new_game(confirm, regenerate_qr, keep_crews)  keep_crews = false deletes every crew (default true keeps
--                                                       older callers working; the admin panel sends it explicitly)
--   set_team_count(n)  adds crews, or removes empty crews (highest number first), until there are n

drop function public.start_new_game(text, boolean);

create function public.start_new_game(p_confirm text, p_regenerate_qr boolean, p_keep_crews boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  perform public._admin();
  if p_confirm is distinct from 'NEW GAME' then raise exception 'CONFIRM_REQUIRED'; end if;
  perform public._delete_player_users(array(select user_id from public.players));
  delete from public.scan_tickets where true;
  delete from public.checkins where true;
  delete from public.tasks where true;
  delete from public.round_results where true;
  delete from public.team_state where true;
  delete from public.players where true;
  -- D-033: every game gets a new pyramid. The course goes (rounds, marks, links, routes); the cards stay with
  -- their places, so generating the next course needs no reprint, only a new master list.
  delete from public.assignments where true;
  delete from public.qr_links where true;
  delete from public.qr_codes where kind <> 'universal';
  delete from public.events where true;
  delete from public.alerts where true;
  delete from public.rate_limits where true;
  delete from public.rounds where true;
  if coalesce(p_keep_crews, true) then
    for t in select id from public.teams loop
      loop
        begin
          update public.teams set code = public._random_code(6), status = 'forming', eliminated_in_round = null,
            final_rank = null, completion_key = null, final_code = null, eliminated_view = null where id = t.id;
          exit;
        exception when unique_violation then
          null; -- code collision: draw again
        end;
      end loop;
    end loop;
  else
    delete from public.teams where true;
  end if;
  if p_regenerate_qr then
    update public.cards set token = public._token(), key = public._random_code(6), created_at = now() where true;
    update public.qr_codes set token = public._token(), key = public._random_code(6) where kind = 'universal';
  end if;
  update public.games set status = case when exists (select 1 from public.teams) then 'REGISTRATION' else 'SETUP' end,
    registration_open = exists (select 1 from public.teams), hints_enabled = false, paused_at = null,
    broadcast = null, broadcast_at = null, started_at = null, finished_at = null, end_reason = null where id = 1;
  perform public._audit('start_new_game', null, null,
    jsonb_build_object('regenerate_qr', p_regenerate_qr, 'keep_crews', coalesce(p_keep_crews, true)));
  perform public._refresh_public();
end $$;

create function public.set_team_count(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  have int;
  empty int;
  removed int := 0;
  t record;
begin
  perform public._admin();
  if p_count is null or p_count < 0 or p_count > 60 then raise exception 'BAD_COUNT'; end if;
  if (select status from public.games where id = 1) not in ('SETUP', 'REGISTRATION', 'READY') then
    raise exception 'GAME_STARTED';
  end if;
  select count(*) into have from public.teams;
  if p_count > have then
    perform public.create_teams(p_count - have);
  elsif p_count < have then
    -- Only crews nobody has joined yet can go; a crew with players is removed from its own card (with a reason).
    select count(*) into empty from public.teams tm where not exists (select 1 from public.players p where p.team_id = tm.id);
    if have - p_count > empty then raise exception 'CREWS_HAVE_PLAYERS'; end if;
    for t in select tm.id from public.teams tm
              where not exists (select 1 from public.players p where p.team_id = tm.id)
              order by tm.number desc limit have - p_count loop
      delete from public.teams where id = t.id;
      removed := removed + 1;
    end loop;
    if p_count = 0 then update public.games set status = 'SETUP', registration_open = false where id = 1; end if;
    perform public._audit('set_team_count', null, null, jsonb_build_object('count', p_count, 'removed', removed));
    perform public._refresh_public();
  end if;
  return jsonb_build_object('before', have, 'after', (select count(*) from public.teams));
end $$;

revoke execute on function public.start_new_game(text, boolean, boolean), public.set_team_count(int)
  from public, anon, authenticated;
grant execute on function public.start_new_game(text, boolean, boolean), public.set_team_count(int) to authenticated;
