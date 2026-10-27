-- Fix (D-046 follow-up): New Game kept the crews when called without the "keep crews" choice. 0027 defaulted it to
-- TRUE so older admin pages kept working, but an admin tab opened before that update (and never reloaded) still sends
-- the old call, so its New Game kept every crew (10 crews, then "add 5" made 15). The default is now FALSE: a new game
-- always starts from zero crews unless "Keep the crews" is ticked, whatever version of the admin page asks.

drop function public.start_new_game(text, boolean, boolean);

create function public.start_new_game(p_confirm text, p_regenerate_qr boolean, p_keep_crews boolean default false)
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
  if coalesce(p_keep_crews, false) then
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
    jsonb_build_object('regenerate_qr', p_regenerate_qr, 'keep_crews', coalesce(p_keep_crews, false)));
  perform public._refresh_public();
end $$;

revoke execute on function public.start_new_game(text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.start_new_game(text, boolean, boolean) to authenticated;
