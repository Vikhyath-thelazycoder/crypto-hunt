-- Row level security (SECURITY.md T1, T10, T17). Players read only their own team_state row and the public
-- state. Every game write goes through security-definer RPCs. Admins read everything and edit only the
-- venue content (locations, venue map, questions) directly.

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.players where user_id = auth.uid();
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'admins', 'games', 'teams', 'players', 'locations', 'venue_map', 'rounds', 'qr_codes', 'qr_links',
    'assignments', 'team_state', 'round_results', 'questions', 'tasks', 'checkins', 'scan_tickets',
    'events', 'alerts', 'admin_audit', 'rate_limits', 'public_state'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Admin-editable venue content.
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.locations, public.venue_map, public.questions to authenticated;
create policy admin_write on public.locations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_write on public.venue_map for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_write on public.questions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Players: their own team's progress row (realtime trigger to refetch my_status) and the public state.
create policy own_team_state on public.team_state for select to authenticated using (team_id = public.my_team_id());
grant select on public.public_state to anon;
create policy everyone_reads on public.public_state for select to anon, authenticated using (true);

-- Functions are callable only where granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.my_team_id() to authenticated;
