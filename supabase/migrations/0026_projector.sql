-- P7 projector (/screen, T-701 … T-704): the public state also carries what the audience screen draws.
--   map     the venue map image (anyone may load it, D-034)
--   ship    per crew: where its ship sits on the map — the region of the last round it completed that is now
--           CLOSED (D-045). A closed round's places are no longer anyone's target, so the projector never points
--           at a mark another crew is still seeking. Same per-crew offset as the phone's visited regions; never a pin.
--   finish_ms, crew   for the podium: time from the start to the final check-in, and the winners' member names
--   latest  the last few public happenings for the LATEST ticker (names and rounds only)
-- Everything else is unchanged from 0003.

create or replace function public._refresh_public() returns void
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
  update public.public_state set data = d, event_seq = event_seq + 1, updated_at = now() where id = 1;
end $$;

revoke all on function public._refresh_public() from public, anon, authenticated;

select public._refresh_public();
