"""The hunt's riddles, one per place (place_no in docs/venue/locations.md). Writes docs/venue/riddles.md and the door-hint migration.
    python3 scripts/venue/riddles.py
"""
from pathlib import Path

R = {
1: "Stay on the ground of the block that takes the alphabet's first letter. Seek the centre of excellence named with three letters, a system big companies use to run their business. Your door is the very first on this floor.",
2: "On the ground floor of the alphabet's first block, machines are learning to think. Find the centre of excellence where data is studied and artificial minds are trained.",
3: "Stay low in the alphabet's first block. Your lab has a three-letter name: it begins like Idea, continues like Design and ends like Test. Bring your best thinking.",
4: "Stay on the ground of the alphabet's first block. Here, falling apples, swinging pendulums and beams of light obey the laws that Newton wrote. Find the lab that tests them.",
5: "Stay on the ground of the alphabet's first block and follow your nose. Test tubes bubble, flasks change colour, and the periodic table watches from the wall. Find the lab where elements meet.",
6: "No books or code are needed here, only sweat and strength. On the ground of the alphabet's second block, find the place where weights are lifted and bodies are made fit.",
7: "On the ground of the alphabet's third block, a lab of future software engineers keeps its data in documents, not tables. Find this centre of excellence. Vivekananda's seminar hall stands facing it.",
8: "On the ground of the alphabet's third block, robots without bodies do the boring work: they click, copy and repeat all day. Find the Information Science lab that teaches this art of automation.",
9: "It never sleeps, it hums all day, and the whole campus's information lives inside. On the ground of the alphabet's third block, find the cool room where the servers stay.",
10: "A compass will help you here. Leave the rooms behind and look for the way in or out that lies between where the sun sets and the Pole Star shines.",
11: "Climb one flight in the alphabet's first block. Your classroom's number is simple: take one hundred, then add the number of wheels on a bicycle.",
12: "One flight up in the alphabet's first block, thirsty students know this spot. Room 104 keeps it close. It serves water and never asks a question.",
13: "One flight up in the alphabet's first block, millions of tiny switches fit on a chip smaller than your fingernail. Four letters name this lab, and they stand for very large designs on a very small scale.",
14: "One flight up in the alphabet's first block, X is always being searched for and pi never ends. Find the department where every problem begins with numbers.",
15: "One flight up in the alphabet's first block, invisible waves are sent and caught. Think of the dish on a rooftop and the signal in your phone. Find the lab that studies them both.",
16: "Climb two flights in the alphabet's first block. Your classroom's number is two hundred, plus the number of wheels on a bicycle.",
17: "Two flights up in the alphabet's first block, there is another place to quench your thirst. Room 204 keeps it close. Find the water waiting on the higher floor.",
18: "Two flights up in the alphabet's first block, researchers bend and steer the smallest pieces of light. Find the research lab where photons do the work.",
19: "Climb two flights in the alphabet's first block. Your classroom's number is two hundred, plus an unlucky number that many buildings try to skip.",
20: "Climb two flights in the alphabet's first block. Your classroom's number is two hundred, plus four multiplied by itself.",
21: "Climb one flight in the alphabet's second block. Your classroom's number is one hundred, plus the sides of a triangle.",
22: "Climb one flight in the alphabet's second block. Your classroom's number is one hundred, plus the fingers on one hand.",
23: "One flight up in the alphabet's second block, no code is compiled, but words are polished. Headphones on, speak clearly. Find the lab that trains your tongue.",
24: "One flight up in the alphabet's second block, rows of screens wait for your commands. Your room is a dozen doors past one hundred. Find the lab where the keyboards click.",
25: "One flight up in the alphabet's second block, a great teacher became India's President, and his birthday is now Teachers' Day. Find the seminar hall that carries his name.",
26: "Climb two flights in the alphabet's second block. Your classroom's number is two hundred, plus the sides of a triangle.",
27: "Climb two flights in the alphabet's second block. Your classroom's number is two hundred, plus the fingers on one hand.",
28: "Climb two flights in the alphabet's second block. Your classroom's number is two hundred, plus the lives of a cat.",
29: "Two flights up in the alphabet's second block, three letters run this department: Information Science and Engineering. Find the place its people call home.",
30: "Two flights up in the alphabet's second block, the seminar hall honours India's great engineer, the man whose birthday is celebrated as Engineers' Day. Find the hall of Sir M.V.",
31: "Climb one flight in the alphabet's third block. Your classroom's number is one hundred, plus the sides of a hexagon.",
32: "Climb one flight in the alphabet's third block. Your classroom's number is one hundred, plus the days in a week.",
33: "Climb one flight in the alphabet's third block. Your classroom's number is one hundred, plus the legs on a spider.",
34: "Climb one flight in the alphabet's third block. Your classroom's number is one hundred, plus the lives of a cat.",
35: "Climb one flight in the alphabet's third block. Your classroom's number is one hundred, plus the fingers on both hands.",
36: "Climb one flight in the alphabet's third block. Your classroom's number is one hundred, plus the players in a full cricket team.",
37: "Climb two flights in the alphabet's third block. Your classroom's number is two hundred, plus the legs on a spider.",
38: "Climb two flights in the alphabet's third block. Your classroom's number is two hundred, plus the lives of a cat.",
39: "Climb two flights in the alphabet's third block. Your classroom's number is two hundred, plus the fingers on both hands.",
40: "Climb two flights in the alphabet's third block. Your classroom's number is two hundred, plus the players in a full cricket team.",
41: "Climb two flights in the alphabet's third block. Your classroom's number is two hundred, plus the months in a year.",
42: "Climb two flights in the alphabet's third block. Your classroom's number is two hundred, plus an unlucky number that many buildings try to skip.",
43: "Where business minds gather upstairs, this ground floor belongs to the body, not the balance sheet. Find the room where the balls, bats and nets are kept.",
44: "On the ground below the managers, metal is cut, shaped and drilled. Mechanical and civil engineers learn with their hands here. Find the machine shop.",
45: "On the ground below the managers, engineers study how warmth moves from hot to cold. Find the lab where heat itself is the subject.",
46: "Students come to learn, but who prepares the way? Seek the mentors who guide them every day. On the level above the ground, find where the educators stay.",
47: "Where commerce meets leadership and strategies unfold, find the learners whose third year is making them bold. Look above the ground, where future business leaders take hold.",
48: "Climb beyond the ground where future managers reside. Find the place where keyboards click and digital experiments thrive. The computers await those who seek knowledge through practical drive.",
49: "Where business minds are shaped and management takes flight, seek the level just above the ground in your sight. Among those learning the language of computers, find the third-year batch preparing for a digital future.",
50: "Seek the level where leadership oversees the institution's way. Find the guardian of decisions, then look nearby. A silent source of refreshment waits beside the office where the highest academic authority resides.",
51: "Ascend to the level where enterprise meets legacy. Think of a visionary who helped transform Indian industry, whose influence reached aviation and beyond. Find the room that honours this titan of Indian business.",
52: "Go beyond the first ascent, to where postgraduate minds explore. Here, digital tools meet the art of determining worth. Find the centre where valuation opens a new door.",
53: "One level above where young business minds begin their climb, lies a place where data becomes insight over time. Seek the scholar associated with business analytics, whose name marks your destination.",
54: "Rise one level higher, where management minds expand their view. Find the name associated with financial management, where numbers guide what organisations do. His legacy is waiting for you.",
55: "Climb to the level where future leaders sharpen their ambition. Seek the person who heads the department of management education. Near that office, find the place that quenches thirst without asking questions.",
56: "Climb to the top of the management block. Here is no classroom but a real company at work on campus. Its name speaks of time, of a point, and of technology. Find its door.",
57: "Climb to the top of the management block. SVFC students practise their speaking here with headphones on. Find their language lab.",
58: "Step outside the management block. When the campus power fails, this machine roars to life, and a quiet park bench sits close by. Find where noise and rest are neighbours.",
59: "Step outside and follow the smell of coffee. It is small, it is friendly, and it is where a quick snack fixes a long lecture. Find the campus cafe.",
60: "Every plate here starts with a payment. In the busiest place at lunch, find the counter where the money changes hands before the food does.",
61: "In the busiest place at lunch, the students are not the only ones eating. Find the tables kept for those who teach.",
62: "Five players, one orange ball and a hoop high above the ground. They call it the park, but listen for the bounce and the swish.",
63: "Out on the open ground, a net stretches between two poles, and six players a side try to keep the ball from falling. Find a pole of that net.",
64: "Out on the open ground, eleven players chase one ball and every shout is for a goal. Find the poles the keeper guards.",
65: "Only some may pass beyond this point, and the guard knows them all. Find the security booth at the hostel where the girls of the campus stay.",
66: "Every visitor's first stop and every student's last goodbye. Find the guard who watches the main way in and out of the whole campus.",
}

# A door-number hint on every numbered room that had none, so a crew that does not know the lab can still find it.
HINT = {1: 'Door number: A, then two zeros, then the number of suns in our sky.', 2: 'Door number: A, then two zeros, then the sides of a triangle.', 3: 'Door number: A, then two zeros, then the days in a week.', 4: 'Door number: A, then two zeros, then the legs on a spider.', 5: 'Door number: A, then two zeros, then the lives of a cat.', 6: 'Door number: B, then two zeros, then the legs on a spider.', 7: 'Door number: C, then two zeros, then the number of suns in our sky.', 8: 'Door number: C, then two zeros, then the wheels on a bicycle.', 9: 'Door number: C, then two zeros, then the legs on a spider.', 13: 'Door number: A, then one hundred plus the lives of a cat.', 14: 'Door number: A, then one hundred plus three times five.', 15: 'Door number: A, then one hundred plus two full cricket teams.', 18: 'Door number: A, then two hundred plus the lives of a cat.', 23: 'Door number: B, then one hundred plus the fingers on both hands.', 24: 'Door number: B, then one hundred plus a dozen.', 25: 'Door number: B, then one hundred plus an unlucky thirteen.', 29: 'Door number: B, then two hundred plus an unlucky thirteen.', 30: 'Door number: B, then two hundred plus three times five.', 44: 'Door number: D, then two zeros, then the sides of a triangle.', 45: 'Door number: D, then two zeros, then the fingers on one hand.', 46: 'Door number: D, then one hundred plus the sides of a hexagon.', 47: 'Door number: D, then one hundred plus the days in a week.', 48: 'Door number: D, then one hundred plus the legs on a spider.', 49: 'Door number: D, then one hundred plus the days in two weeks.', 51: 'Door number: D, then two hundred plus the fingers on one hand.', 52: 'Door number: D, then two hundred plus the sides of a hexagon.', 53: 'Door number: D, then two hundred plus the fingers on both hands.', 54: 'Door number: D, then two hundred plus one full cricket team.', 56: 'Door number: D, then three hundred plus the fingers on one hand.', 57: 'Door number: D, then three hundred plus one full cricket team.'}
R = {n: f"{t} {HINT[n]}" if n in HINT else t for n, t in R.items()}

ANSWER = {}
root = Path(__file__).resolve().parents[2]
for line in (root / "docs/venue/locations.md").read_text().splitlines():
    c = [x.strip() for x in line.split("|")]
    if len(c) > 5 and c[1].isdigit():
        ANSWER[int(c[1])] = (c[2], c[5])
assert sorted(R) == sorted(ANSWER) == list(range(1, 67))
assert len(set(R.values())) == 66

md = ["# Crypto Hunt riddles", "", "One riddle per place. Keep this sheet away from players: it holds every answer.", "",
      "| # | Answer | Group | Riddle |", "|---|---|---|---|"]
md += [f"| {n} | {ANSWER[n][1]} | {ANSWER[n][0]} | {R[n]} |" for n in sorted(R)]
(root / "docs/venue/riddles.md").write_text("\n".join(md) + "\n")

q = lambda s: "'" + s.replace("'", "''") + "'"
rows = ",\n".join(f"  ({n}, {q(HINT[n])})" for n in sorted(HINT))
(root / "supabase/migrations/0038_riddle_door_hints.sql").write_text(f"""-- A door-number hint on every numbered room whose riddle had none. Added to the end, so a riddle edited in the admin panel keeps
-- its edit. Places, routes and printed cards are not touched.
update public.clue_sets s set riddle = s.riddle || ' ' || h.hint
  from (values
{rows}
  ) as h(place_no, hint)
  join public.locations l on l.place_no = h.place_no
 where s.location_id = l.id and s.set_no = 1 and s.riddle is not null and s.riddle not like '%Door number:%';
""")
print("riddles", len(R), "longest", max(map(len, R.values())))
