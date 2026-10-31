-- A door-number hint on every numbered room whose riddle had none. Added to the end, so a riddle edited in the admin panel keeps
-- its edit. Places, routes and printed cards are not touched.
update public.clue_sets s set riddle = s.riddle || ' ' || h.hint
  from (values
  (1, 'Door number: A, then two zeros, then the number of suns in our sky.'),
  (2, 'Door number: A, then two zeros, then the sides of a triangle.'),
  (3, 'Door number: A, then two zeros, then the days in a week.'),
  (4, 'Door number: A, then two zeros, then the legs on a spider.'),
  (5, 'Door number: A, then two zeros, then the lives of a cat.'),
  (6, 'Door number: B, then two zeros, then the legs on a spider.'),
  (7, 'Door number: C, then two zeros, then the number of suns in our sky.'),
  (8, 'Door number: C, then two zeros, then the wheels on a bicycle.'),
  (9, 'Door number: C, then two zeros, then the legs on a spider.'),
  (13, 'Door number: A, then one hundred plus the lives of a cat.'),
  (14, 'Door number: A, then one hundred plus three times five.'),
  (15, 'Door number: A, then one hundred plus two full cricket teams.'),
  (18, 'Door number: A, then two hundred plus the lives of a cat.'),
  (23, 'Door number: B, then one hundred plus the fingers on both hands.'),
  (24, 'Door number: B, then one hundred plus a dozen.'),
  (25, 'Door number: B, then one hundred plus an unlucky thirteen.'),
  (29, 'Door number: B, then two hundred plus an unlucky thirteen.'),
  (30, 'Door number: B, then two hundred plus three times five.'),
  (44, 'Door number: D, then two zeros, then the sides of a triangle.'),
  (45, 'Door number: D, then two zeros, then the fingers on one hand.'),
  (46, 'Door number: D, then one hundred plus the sides of a hexagon.'),
  (47, 'Door number: D, then one hundred plus the days in a week.'),
  (48, 'Door number: D, then one hundred plus the legs on a spider.'),
  (49, 'Door number: D, then one hundred plus the days in two weeks.'),
  (51, 'Door number: D, then two hundred plus the fingers on one hand.'),
  (52, 'Door number: D, then two hundred plus the sides of a hexagon.'),
  (53, 'Door number: D, then two hundred plus the fingers on both hands.'),
  (54, 'Door number: D, then two hundred plus one full cricket team.'),
  (56, 'Door number: D, then three hundred plus the fingers on one hand.'),
  (57, 'Door number: D, then three hundred plus one full cricket team.')
  ) as h(place_no, hint)
  join public.locations l on l.place_no = h.place_no
 where s.location_id = l.id and s.set_no = 1 and s.riddle is not null and s.riddle not like '%Door number:%';
