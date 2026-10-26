# Writes docs/venue/clues.md: two clue sets (4 pieces, one per member, plus a hint) for every place in
# docs/venue/locations.md (T-503, D-033). The pieces only make sense together: building, floor, which room or
# spot, and what is there. Clean, general humour (D-036). Run: python3 -I scripts/venue/write_clues.py
import re
import sys

LOCS = "docs/venue/locations.md"
OUT = "docs/venue/clues.md"

MAIN1 = "Start at the biggest block on campus: the one with a leafy courtyard in its middle."
MAIN2 = "`campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof."
FLOOR1 = {
    "Ground floor": "Save your legs: this one is on the ground floor.",
    "1st floor": "Climb exactly one flight of stairs.",
    "2nd floor": "Climb two flights: the top floor.",
}
FLOOR2 = {
    "Ground floor": "`floor = 0`. No stairs today.",
    "1st floor": "`floor = 2 - 1`. One flight up.",
    "2nd floor": "`floor = 1 + 1`. Up, then up again.",
}
WING1 = {"A": "Wing: the first letter of the alphabet.", "B": "Wing: the letter right after A.", "C": "Wing: the third letter of the alphabet."}
WING2 = {"A": "Wing = `chr(65)`.", "B": "Wing = `chr(66)`.", "C": "Wing = `chr(67)`, also a language famous for pointers."}
ROOM1 = {
    "01": "The door number ends in 01: the very first room of that corridor.",
    "05": "The door number ends in 05: count the fingers on one hand.",
    "09": "The door number ends in 09: the last of the nine rooms.",
    "12": "The door number ends in 12: as many as the months in a year.",
    "13": "The door number ends in 13: the number many lifts skip.",
    "14": "The door number ends in 14: two whole weeks of days.",
    "15": "The door number ends in 15: a quarter of an hour in minutes.",
}
ROOM2 = {
    "01": "Last two digits of the door: `str(1).zfill(2)`.",
    "05": "Last two digits of the door: `str(10 // 2).zfill(2)`.",
    "09": "Last two digits of the door: `str(3 ** 2).zfill(2)`.",
    "12": "Last two digits of the door: `0xC` in decimal.",
    "13": "Last two digits of the door: a baker's dozen.",
    "14": "Last two digits of the door: `7 * 2`.",
    "15": "Last two digits of the door: `0xF` in decimal.",
}

SPECIAL = {
    "Registration Desk": [
        (MAIN1, FLOOR1["Ground floor"], "Do not go deep inside: it is right at the main entrance.", "A desk, not a room: the first place visitors sign in.", "The desk you meet first as you walk in through the main entrance."),
        (MAIN2, FLOOR2["Ground floor"], "`entrance.first()`: the first thing you see when you walk in.", "Every visitor's tutorial level: write your name here first.", "Main block, ground floor: the desk at the main entrance."),
    ],
    "Registration Office": [
        (MAIN1, FLOOR1["Ground floor"], "Find the desk at the main entrance, then look right beside it.", "Not the desk itself: the office next to it where forms are filed.", "The office next to the registration desk at the main entrance."),
        (MAIN2, FLOOR2["Ground floor"], "`desk.neighbour()`: it sits next to the desk at the entrance.", "Where signed forms go to become official records.", "Main block entrance: the office beside the registration desk."),
    ],
    "Admission Office": [
        (MAIN1, FLOOR1["Ground floor"], "Near the main entrance, close to the registration desk.", "Every student's college story begins here: getting admitted.", "The office near the main entrance where admissions happen."),
        (MAIN2, FLOOR2["Ground floor"], "`student.status = 'admitted'` happens in this office.", "Near the entrance, a neighbour of the registration desk.", "Main block entrance: the admission office."),
    ],
    "Principal's Cabin — waiting area": [
        (MAIN1, FLOOR1["Ground floor"], "Find the cabin of the person who heads the whole college.", "Do not knock: the card waits where visitors sit outside.", "The waiting area outside the principal's cabin."),
        (MAIN2, FLOOR2["Ground floor"], "`college.head`: the boss level of the whole college.", "Stay in the lobby: the waiting seats outside the cabin.", "Ground floor of the main block: wait outside the principal's cabin."),
    ],
    "Dean's Office — waiting area": [
        (MAIN1, FLOOR1["Ground floor"], "Find the office of the dean.", "You never go in: look where visitors wait outside it.", "The waiting area outside the dean's office."),
        (MAIN2, FLOOR2["Ground floor"], "Rhymes with 'clean' and 'green': the ____'s office.", "`while not called: wait()` in the seats outside.", "Ground floor of the main block: wait outside the dean's office."),
    ],
    "Boardroom — waiting area": [
        (MAIN1, FLOOR1["Ground floor"], "Find the room where the big meetings around one long table happen.", "Stay outside: the card is where people wait before a meeting.", "The waiting area outside the boardroom."),
        (MAIN2, FLOOR2["Ground floor"], "Not bored, BOARD: the meeting room of the bosses.", "`meeting.lobby`: the seats outside it.", "Ground floor of the main block: wait outside the boardroom."),
    ],
    "Placements Office": [
        (MAIN1, FLOOR1["Ground floor"], "The office final-year students visit hoping for a job.", "Offer letters are announced from here.", "The placements office on the ground floor of the main block."),
        (MAIN2, FLOOR2["Ground floor"], "`if offer_letter: celebrate()` starts in this office.", "Where 'any updates on the drive?' is asked a hundred times a day.", "Main block, ground floor: the placements office."),
    ],
    "Swami Vivekananda Seminar Hall": [
        (MAIN1, FLOOR1["Ground floor"], "A big hall named after the monk who said 'Sisters and brothers of America' in 1893.", "Seminars happen here: look under the podium on the stage.", "The Swami Vivekananda Seminar Hall: check under the podium."),
        (MAIN2, FLOOR2["Ground floor"], "Chicago, 1893: name the speaker, then find his hall.", "`stage.podium.under()`", "The seminar hall named after Swami Vivekananda, under the podium."),
    ],
    "IDT Lab": [
        (MAIN1, FLOOR1["Ground floor"], "A lab whose door carries three letters: I, D and T.", "Ten or more computers: the card is under the last system's desk in the back row.", "The IDT Lab on the ground floor: under the last desk in the back row."),
        (MAIN2, FLOOR2["Ground floor"], "Lab name = `'TDI'[::-1]`.", "`systems[-1]`: the last computer in the back row. Look under its desk.", "IDT Lab, ground floor of the main block, last desk at the back."),
    ],
    "Library — magazine rack": [
        (MAIN1, FLOOR1["Ground floor"], "The quietest place in the block, where books are borrowed.", "Skip the books: look behind the glossy monthly magazines on the bottom shelf of their rack.", "Library ground floor: behind the magazines on the bottom shelf of the magazine rack."),
        (MAIN2, FLOOR2["Ground floor"], "`shh()`: the room of shelves and silence.", "Not a book, a monthly issue: check behind the magazines, bottom shelf.", "The library's magazine rack, bottom shelf."),
    ],
    "Library — book area": [
        (MAIN1, FLOOR1["Ground floor"], "The quietest place in the block, where books are borrowed.", "Walk in past the ID scanner on the right; the books and seats are on the left.", "Library ground floor: between the books on the bottom shelf of the first rack on the left."),
        (MAIN2, FLOOR2["Ground floor"], "`library.ground_floor`: books on the left, scanner on the right.", "`shelves[0].bottom`: the first rack on the left, lowest shelf, between the books.", "In the library, first rack on the left, bottom shelf."),
    ],
    "Library — IEEE papers shelf": [
        (MAIN1, FLOOR1["1st floor"], "Inside the library, go up to its first floor.", "Research papers named after four letters: I, E, E, E, plus mini projects on the same shelf.", "Library first floor, front side: inside the IEEE papers and mini projects shelf, bottom row."),
        (MAIN2, FLOOR2["1st floor"], "`library.floor(1)`: up one level inside the library.", "`'I' + 'E' * 3`: the papers shelf at the front. Bottom row.", "The IEEE papers shelf on the library's first floor."),
    ],
    "Library — computer area": [
        (MAIN1, FLOOR1["1st floor"], "Inside the library, go up to its first floor.", "Walk past the front seats to the back side, where computers wait for students.", "Library first floor, back side: under the desk of the last system."),
        (MAIN2, FLOOR2["1st floor"], "`library.floor(1).back`: the part with systems to work on.", "`systems[-1]`: the last computer at the back. Look under its desk.", "The computer area at the back of the library's first floor."),
    ],
    "Library — seating area": [
        (MAIN1, FLOOR1["2nd floor"], "Inside the library, go all the way up to its top floor.", "No computers, no papers: only seats and silence.", "Library second floor: under the last table in the seating area."),
        (MAIN2, FLOOR2["2nd floor"], "`library.floors[-1]`: the top floor of the library.", "`tables[-1]`: the last table in the seating area. Look under it.", "The seating area on the library's top floor, last table."),
    ],
    "First workshop": [
        ("Head to the block next to the park with the benches.", "Ground floor, where machines hum: a workshop.", "Count the workshops from the block's main entrance: you want number one.", "The card is under the workbench nearest the door.", "MBA Block: the first workshop from the main entrance, under the workbench by the door."),
        ("`park.neighbour`: the block next to the benches.", "`workshops[0]`: the first one from the main entrance.", "Machines and workbenches, not desks and boards.", "`door.nearest(workbench)`: look under it.", "The first workshop in the MBA Block."),
    ],
    "Second workshop": [
        ("Head to the block next to the park with the benches.", "Ground floor, where machines hum: a workshop.", "Count the workshops from the block's main entrance: you want number two.", "The card is under the workbench nearest the door.", "MBA Block: the second workshop from the main entrance, under the workbench by the door."),
        ("`park.neighbour`: the block next to the benches.", "`workshops[1]`: zero-indexed, so the second one from the main entrance.", "Machines and workbenches, not desks and boards.", "`door.nearest(workbench)`: look under it.", "The second workshop in the MBA Block."),
    ],
    "Third workshop": [
        ("Head to the block next to the park with the benches.", "Ground floor, where machines hum: a workshop.", "Count the workshops from the block's main entrance: you want number three.", "The card is under the workbench nearest the door.", "MBA Block: the third workshop from the main entrance, under the workbench by the door."),
        ("`park.neighbour`: the block next to the benches.", "`workshops[2]`: zero-indexed, so the third one from the main entrance.", "Machines and workbenches, not desks and boards.", "`door.nearest(workbench)`: look under it.", "The third workshop in the MBA Block."),
    ],
    "Order counter": [
        ("Where hungry students go between classes.", "It stands right next to the MBA Block.", "The spot where you say what you want to eat.", "Feel under the front ledge of the counter.", "Canteen: taped under the front ledge of the order counter."),
        ("`while hungry: go()` to the building beside the MBA Block.", "`order = input('What will you have?')`", "The counter, not the kitchen.", "`counter.ledge.under()`", "The canteen's order counter."),
    ],
    "Seating area": [
        ("Where hungry students go between classes.", "It stands right next to the MBA Block.", "Not where food is cooked: where it is eaten, at the tables.", "Find the last table and look under it.", "Canteen seating area: under the last table (never in the kitchen)."),
        ("`while hungry: go()` to the building beside the MBA Block.", "`sit(); eat(); repeat()`", "`tables[-1]`: the last table.", "Look under it, never in the kitchen.", "The canteen's seating area, last table."),
    ],
    "Drinking water station": [
        ("Where hungry students go between classes.", "It stands right next to the MBA Block.", "Not food: the place you fill your bottle.", "Check the side of the water station.", "Canteen: taped on the side of the drinking water station."),
        ("`while hungry: go()` to the building beside the MBA Block.", "`bottle.fill(H2O)`", "Stay hydrated: the water station.", "`station.side`: taped there.", "The canteen's drinking water station, on its side."),
    ],
    "Hand-wash station": [
        ("Where hungry students go between classes.", "It stands right next to the MBA Block.", "Before you eat, you wash your hands here.", "Feel under the ledge of the basin.", "Canteen: taped under the ledge of the hand-wash basin."),
        ("`while hungry: go()` to the building beside the MBA Block.", "`hands.wash(soap=True)` before `eat()`.", "The basins, not the water bottles.", "`basin.ledge.under()`", "The canteen's hand-wash station, under the basin ledge."),
    ],
    "SVIT Cafe": [
        ("A small shop with drinks and chocolates.", "It sits next to the big ground where volleyball and cricket are played.", "Not the canteen: smaller, and outdoors by the ground.", "Look for a poster on its wall.", "The SVIT Cafe by the main ground: the poster on its wall."),
        ("`snack = cafe.buy('chocolate')`", "`ground.neighbour`: next to the volleyball and cricket ground.", "Small but mighty, like a tiny function that does one job.", "`wall.poster`", "The small cafe by the main ground."),
    ],
    "Park": [
        ("Green, open and full of benches.", "It sits right next to the MBA Block.", "Outdoors: no roof over this one.", "Look under the bench nearest the MBA Block.", "The park by the MBA Block: under the bench nearest the block."),
        ("`touch_grass()`: yes, literally.", "`mba_block.neighbour`: the green one.", "`benches.sort(key=distance_to_mba)[0]`", "Look under it.", "The park next to the MBA Block, nearest bench."),
    ],
    "Net nearest the Main Engineering Block": [
        ("A court with two hoops, between the main block and the MBA Block.", "Dribble, shoot, score: basketball.", "Of the two nets, choose the one closer to the main block.", "Check the back of its pole.", "Basketball court: the net nearest the main block, back of the pole."),
        ("`court = between(main_block, mba_block)`", "`sport = 'basket' + 'ball'`", "`nets.closest_to(main_block)`", "`pole.back`", "The basketball net on the main block side."),
    ],
    "Net nearest the MBA Block": [
        ("A court with two hoops, between the main block and the MBA Block.", "Dribble, shoot, score: basketball.", "Of the two nets, choose the one closer to the MBA Block.", "Check the back of its pole.", "Basketball court: the net nearest the MBA Block, back of the pole."),
        ("`court = between(main_block, mba_block)`", "`sport = 'basket' + 'ball'`", "`nets.closest_to(mba_block)`", "`pole.back`", "The basketball net on the MBA Block side."),
    ],
    "Football goal post": [
        ("The biggest open ground on campus, near the girls' hostel.", "Outdoors, where teams play many games.", "Kick, run, GOAL: the game with two goal posts.", "Check the back of a goal post.", "Main ground: the back of a football goal post."),
        ("`ground = max(open_spaces)`, beside the girls' hostel.", "Played with feet, called football by most of the world.", "`goal.post.back`", "Siuuu: think of the posts, not the players.", "The football goal post on the main ground."),
    ],
    "Volleyball net": [
        ("The biggest open ground on campus, near the girls' hostel.", "Outdoors, where teams play many games.", "Bump, set, spike: the net strung high between two poles.", "Check one of the net's poles.", "Main ground: on a volleyball net pole."),
        ("`ground = max(open_spaces)`, beside the girls' hostel.", "`ball.over(net)` with your hands.", "Not the goal posts, not the pitch: the high net.", "`net.pole`", "The volleyball net on the main ground."),
    ],
    "Cricket pitch": [
        ("The biggest open ground on campus, near the girls' hostel.", "Outdoors, where teams play many games.", "Twenty-two yards long, with a bowler at one end.", "Look under a rock at one end of the pitch.", "Main ground: under a rock at one end of the cricket pitch."),
        ("`ground = max(open_spaces)`, beside the girls' hostel.", "`runs += 6`: the game with bat, ball and stumps.", "`pitch.ends[0]`", "Lift the rock there.", "The cricket pitch on the main ground, under a rock at one end."),
    ],
}
HOSTEL = {
    "Girls' Hostel": [
        ("Find where students live, near the big ground.", "The girls' one, not the boys'.", "Do not go inside: find the security guard's cabin at the gate.", "The card is taped on the outside back wall of the cabin.", "Girls' hostel: outside back wall of the security guard cabin."),
        ("`home_away_from_home` for girls, next to the main ground.", "`gate.guard.cabin`", "Never enter the hostel: stay at the cabin.", "`cabin.back_wall.outside`", "The girls' hostel guard cabin, outside back wall."),
    ],
    "Boys' Hostel": [
        ("Find where students live, on the far side of campus from the big ground.", "The boys' one, not the girls'.", "Do not go inside: find the security guard's cabin at the gate.", "The card is taped on the outside back wall of the cabin.", "Boys' hostel: outside back wall of the security guard cabin."),
        ("`home_away_from_home` for boys.", "`gate.guard.cabin`", "Never enter the hostel: stay at the cabin.", "`cabin.back_wall.outside`", "The boys' hostel guard cabin, outside back wall."),
    ],
}


def cad(n):
    word = {1: "first", 2: "second", 3: "third"}[n]
    return [
        (MAIN1, FLOOR1["Ground floor"], "Computer-Aided Design happens in these labs, opposite the seminar hall.", f"Count the CAD labs starting after the library: you want the {word}. Under the last desk in the back row.", f"CAD Lab {n}, ground floor, opposite the seminar hall: the {word} after the library."),
        (MAIN2, FLOOR2["Ground floor"], "`'C' + 'A' + 'D'`: design labs across from the big seminar hall.", f"`cad_labs[{n - 1}]` counting from the library. `systems[-1]`: look under the last desk at the back.", f"The {word} CAD lab after the library."),
    ]


def room(wing, floor, num):
    return [
        (MAIN1, FLOOR1[floor], WING1[wing], ROOM1[num], f"Main block, {floor.lower()}, wing {wing}, the room ending in {num}."),
        (MAIN2, FLOOR2[floor], WING2[wing], ROOM2[num], f"Wing {wing}, {floor.lower()}, door ending in {num}."),
    ]


def lab(floor, num):
    tail = num[1:]
    return [
        (MAIN1, FLOOR1[floor], "Wing: the third letter of the alphabet. A lab full of computers, not a classroom.", ROOM1[tail] + " Under the last desk in the back row.", f"Lab C{num}, {floor.lower()}: under the last desk in the back row."),
        (MAIN2, FLOOR2[floor], "Wing = `chr(67)`, and `room.type == 'lab'`.", ROOM2[tail] + " Then `systems[-1]`: under its desk.", f"Lab C{num}, last desk at the back."),
    ]


def triangle(floor):
    a, b = ("117", "118") if floor == "1st floor" else ("217", "218")
    return [
        (MAIN1, FLOOR1[floor], "A lab named after a shape with three sides.", f"Two halves, {a} and {b}, behind one shared door. Under the last desk in the back row.", f"The Triangle Lab ({a} and {b}), {floor.lower()}."),
        (MAIN2, FLOOR2[floor], "`sides == 3`: name the shape, find its lab.", f"`room in ({a}, {b})`: one door, two sections. `systems[-1]`: under its desk.", f"Triangle Lab, {floor.lower()}, last desk at the back."),
    ]


def clues_for(building, floor, place):
    if place in SPECIAL:
        return SPECIAL[place]
    if building in HOSTEL:
        return HOSTEL[building]
    m = re.fullmatch(r"CAD Lab (\d)", place)
    if m:
        return cad(int(m.group(1)))
    m = re.fullmatch(r"Room ([ABC])\d(\d\d)", place)
    if m:
        return room(m.group(1), floor, m.group(2))
    m = re.fullmatch(r"Lab C(\d{3})", place)
    if m:
        return lab(floor, m.group(1))
    if place.startswith("Triangle Lab"):
        return triangle(floor)
    sys.exit(f"no clues for {building} / {floor} / {place}")


rows = [
    [c.strip() for c in line.split("|")[1:-1]]
    for line in open(LOCS, encoding="utf-8")
    if re.match(r"^\| \d+ \|", line)
]
out = [
    "# Crypto Hunt clues",
    "",
    "Two clue sets for every place in `locations.md` (T-503). Each set has four pieces, one per crew member, and a hint.",
    "A crew sees a piece when the member holding it answers their question; the four together lead to one place only.",
    "Each game draws a different set, and crews sharing a mark get different sets (D-033). Edit freely here or in the",
    "admin panel (Locations › Clue 1 / Clue 2); `npx tsx scripts/clues-sql.mts` turns this file into SQL.",
    "",
]
problems = []
for no, building, floor, place, *_ in rows:
    sets = clues_for(building, floor, place)
    out += [f"## #{no} · {building} · {floor} · {place}", "", "| Set | I | II | III | IV | Hint |", "|---|---|---|---|---|---|"]
    for k, s in enumerate(sets, 1):
        for t in s:
            if len(t) > 200 or "|" in t:
                problems.append(f"#{no} set {k}: {t[:40]}…")
        out.append(f"| {k} | " + " | ".join(s) + " |")
    out.append("")
if problems:
    sys.exit("\n".join(problems))
open(OUT, "w", encoding="utf-8").write("\n".join(out))
print(f"{OUT}: {len(rows)} places, {sum(len(clues_for(b, f, p)) for _, b, f, p, *_ in rows)} sets")
