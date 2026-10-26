-- D-043: every place says exactly where it is, so the cut-off stub of its printed QR card (and the admin panel) can
-- tell the person hiding it where it goes: place number (the # in docs/venue/locations.md), building, floor and a
-- landmark. The hiding spot stays in `notes`. Players never read locations (RLS), so none of this reaches a phone.

alter table public.locations
  add column place_no int check (place_no between 1 and 999),
  add column building text check (char_length(building) <= 60),
  add column floor text check (char_length(floor) <= 30),
  add column landmark text check (char_length(landmark) <= 160),
  add constraint locations_place_no_key unique (place_no);
