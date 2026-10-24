-- Supabase advisor findings after 0007.
-- Security: pin search_path on the two helpers that lacked it.
alter function public._fail(text, jsonb) set search_path = '';
alter function public._reason(text) set search_path = '';

-- Performance: index foreign keys the game reads on hot paths (alerts/timeline per team, scans, question picks).
create index alerts_team_idx on public.alerts (team_id);
create index events_team_idx on public.events (team_id);
create index checkins_qr_idx on public.checkins (qr_id);
create index qr_codes_round_idx on public.qr_codes (round);
create index qr_codes_location_idx on public.qr_codes (location_id);
create index qr_links_to_idx on public.qr_links (to_qr);
create index tasks_question_idx on public.tasks (question_id);
