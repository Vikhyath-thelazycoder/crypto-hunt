-- D-042 (T-510): every place has a route area (Main Block, MBA area, North, Boys' Hostel …). The generator alternates
-- areas round by round; the server refuses any link that keeps a crew in the same area, so a crew's next place is
-- always somewhere else on campus. Places without an area are never refused.

alter table public.locations add column area text check (char_length(area) <= 40);

create function public._check_link_area() returns trigger
language plpgsql set search_path = public as $$
declare a text;
begin
  select lf.area into a from public.qr_codes f join public.locations lf on lf.id = f.location_id
   join public.qr_codes t on t.id = new.to_qr join public.locations lt on lt.id = t.location_id
   where f.id = new.from_qr and lf.area is not null and lf.area = lt.area;
  if a is not null then
    raise exception 'BAD_PLAN: a link keeps crews in %; the next place must be in another area', a;
  end if;
  return new;
end $$;
revoke execute on function public._check_link_area() from public, anon, authenticated;

create trigger qr_links_area before insert or update on public.qr_links
  for each row execute function public._check_link_area();
