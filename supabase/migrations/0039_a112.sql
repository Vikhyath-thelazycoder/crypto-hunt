-- The Microwave and Antenna Lab is A-112, not A-122. Its printed card keeps its QR and code.
update public.locations set name = 'A-112 Microwave and Antenna Lab' where place_no = 15;
update public.clue_sets s set riddle = replace(s.riddle, 'Door number: A, then one hundred plus two full cricket teams.', 'Door number: A, then one hundred plus a dozen.')
  from public.locations l where l.id = s.location_id and l.place_no = 15;
