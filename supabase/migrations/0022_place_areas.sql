-- D-042: route areas for the venue's places loaded from docs/venue/locations.md (the seed file only runs once, so
-- its later area column never reached the database). Places without a building (test spots) are left alone.
update public.locations set area = case building
    when 'Main Engineering Block' then 'Main Block'
    when 'MBA Block' then 'MBA area'
    when 'Canteen' then 'MBA area'
    when 'Park' then 'MBA area'
    when 'Basketball Court' then 'MBA area'
    when 'Main Ground' then 'North'
    when 'SVIT Cafe' then 'North'
    when 'Girls'' Hostel' then 'North'
    when 'Boys'' Hostel' then 'Boys'' Hostel'
  end
 where area is null and building in ('Main Engineering Block', 'MBA Block', 'Canteen', 'Park', 'Basketball Court',
                                     'Main Ground', 'SVIT Cafe', 'Girls'' Hostel', 'Boys'' Hostel');
