# Crypto Hunt clues

Two clue sets for every place in `locations.md` (T-503). Each set has four pieces, one per crew member, and a hint.
A crew sees a piece when the member holding it answers their question; the four together lead to one place only.
Each game draws a different set, and crews sharing a mark get different sets (D-033). Edit freely here or in the
admin panel (Locations › Clue 1 / Clue 2); `npx tsx scripts/clues-sql.mts` turns this file into SQL.

## #1 · Main Engineering Block · Ground floor · Registration Desk

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Do not go deep inside: it is right at the main entrance. | A desk, not a room: the first place visitors sign in. | The desk you meet first as you walk in through the main entrance. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `entrance.first()`: the first thing you see when you walk in. | Every visitor's tutorial level: write your name here first. | Main block, ground floor: the desk at the main entrance. |

## #2 · Main Engineering Block · Ground floor · Registration Office

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Find the desk at the main entrance, then look right beside it. | Not the desk itself: the office next to it where forms are filed. | The office next to the registration desk at the main entrance. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `desk.neighbour()`: it sits next to the desk at the entrance. | Where signed forms go to become official records. | Main block entrance: the office beside the registration desk. |

## #3 · Main Engineering Block · Ground floor · Admission Office

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Near the main entrance, close to the registration desk. | Every student's college story begins here: getting admitted. | The office near the main entrance where admissions happen. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `student.status = 'admitted'` happens in this office. | Near the entrance, a neighbour of the registration desk. | Main block entrance: the admission office. |

## #4 · Main Engineering Block · Ground floor · Principal's Cabin — waiting area

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Find the cabin of the person who heads the whole college. | Do not knock: the card waits where visitors sit outside. | The waiting area outside the principal's cabin. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `college.head`: the boss level of the whole college. | Stay in the lobby: the waiting seats outside the cabin. | Ground floor of the main block: wait outside the principal's cabin. |

## #5 · Main Engineering Block · Ground floor · Dean's Office — waiting area

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Find the office of the dean. | You never go in: look where visitors wait outside it. | The waiting area outside the dean's office. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | Rhymes with 'clean' and 'green': the ____'s office. | `while not called: wait()` in the seats outside. | Ground floor of the main block: wait outside the dean's office. |

## #6 · Main Engineering Block · Ground floor · Boardroom — waiting area

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Find the room where the big meetings around one long table happen. | Stay outside: the card is where people wait before a meeting. | The waiting area outside the boardroom. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | Not bored, BOARD: the meeting room of the bosses. | `meeting.lobby`: the seats outside it. | Ground floor of the main block: wait outside the boardroom. |

## #7 · Main Engineering Block · Ground floor · Placements Office

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | The office final-year students visit hoping for a job. | Offer letters are announced from here. | The placements office on the ground floor of the main block. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `if offer_letter: celebrate()` starts in this office. | Where 'any updates on the drive?' is asked a hundred times a day. | Main block, ground floor: the placements office. |

## #8 · Main Engineering Block · Ground floor · Swami Vivekananda Seminar Hall

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | A big hall named after the monk who said 'Sisters and brothers of America' in 1893. | Seminars happen here: look under the podium on the stage. | The Swami Vivekananda Seminar Hall: check under the podium. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | Chicago, 1893: name the speaker, then find his hall. | `stage.podium.under()` | The seminar hall named after Swami Vivekananda, under the podium. |

## #9 · Main Engineering Block · Ground floor · CAD Lab 1

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Computer-Aided Design happens in these labs, opposite the seminar hall. | Count the CAD labs starting after the library: you want the first. Under the last desk in the back row. | CAD Lab 1, ground floor, opposite the seminar hall: the first after the library. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `'C' + 'A' + 'D'`: design labs across from the big seminar hall. | `cad_labs[0]` counting from the library. `systems[-1]`: look under the last desk at the back. | The first CAD lab after the library. |

## #10 · Main Engineering Block · Ground floor · CAD Lab 2

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Computer-Aided Design happens in these labs, opposite the seminar hall. | Count the CAD labs starting after the library: you want the second. Under the last desk in the back row. | CAD Lab 2, ground floor, opposite the seminar hall: the second after the library. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `'C' + 'A' + 'D'`: design labs across from the big seminar hall. | `cad_labs[1]` counting from the library. `systems[-1]`: look under the last desk at the back. | The second CAD lab after the library. |

## #11 · Main Engineering Block · Ground floor · CAD Lab 3

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | Computer-Aided Design happens in these labs, opposite the seminar hall. | Count the CAD labs starting after the library: you want the third. Under the last desk in the back row. | CAD Lab 3, ground floor, opposite the seminar hall: the third after the library. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `'C' + 'A' + 'D'`: design labs across from the big seminar hall. | `cad_labs[2]` counting from the library. `systems[-1]`: look under the last desk at the back. | The third CAD lab after the library. |

## #12 · Main Engineering Block · Ground floor · IDT Lab

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | A lab whose door carries three letters: I, D and T. | Ten or more computers: the card is under the last system's desk in the back row. | The IDT Lab on the ground floor: under the last desk in the back row. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | Lab name = `'TDI'[::-1]`. | `systems[-1]`: the last computer in the back row. Look under its desk. | IDT Lab, ground floor of the main block, last desk at the back. |

## #13 · Main Engineering Block · Ground floor · Library — magazine rack

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | The quietest place in the block, where books are borrowed. | Skip the books: look behind the glossy monthly magazines on the bottom shelf of their rack. | Library ground floor: behind the magazines on the bottom shelf of the magazine rack. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `shh()`: the room of shelves and silence. | Not a book, a monthly issue: check behind the magazines, bottom shelf. | The library's magazine rack, bottom shelf. |

## #14 · Main Engineering Block · Ground floor · Library — book area

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Save your legs: this one is on the ground floor. | The quietest place in the block, where books are borrowed. | Walk in past the ID scanner on the right; the books and seats are on the left. | Library ground floor: between the books on the bottom shelf of the first rack on the left. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 0`. No stairs today. | `library.ground_floor`: books on the left, scanner on the right. | `shelves[0].bottom`: the first rack on the left, lowest shelf, between the books. | In the library, first rack on the left, bottom shelf. |

## #15 · Main Engineering Block · 1st floor · Room A101

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the first letter of the alphabet. | The door number ends in 01: the very first room of that corridor. | Main block, 1st floor, wing A, the room ending in 01. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(65)`. | Last two digits of the door: `str(1).zfill(2)`. | Wing A, 1st floor, door ending in 01. |

## #16 · Main Engineering Block · 1st floor · Room A105

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the first letter of the alphabet. | The door number ends in 05: count the fingers on one hand. | Main block, 1st floor, wing A, the room ending in 05. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(65)`. | Last two digits of the door: `str(10 // 2).zfill(2)`. | Wing A, 1st floor, door ending in 05. |

## #17 · Main Engineering Block · 1st floor · Room A109

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the first letter of the alphabet. | The door number ends in 09: the last of the nine rooms. | Main block, 1st floor, wing A, the room ending in 09. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(65)`. | Last two digits of the door: `str(3 ** 2).zfill(2)`. | Wing A, 1st floor, door ending in 09. |

## #18 · Main Engineering Block · 1st floor · Room B101

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the letter right after A. | The door number ends in 01: the very first room of that corridor. | Main block, 1st floor, wing B, the room ending in 01. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(66)`. | Last two digits of the door: `str(1).zfill(2)`. | Wing B, 1st floor, door ending in 01. |

## #19 · Main Engineering Block · 1st floor · Room B105

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the letter right after A. | The door number ends in 05: count the fingers on one hand. | Main block, 1st floor, wing B, the room ending in 05. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(66)`. | Last two digits of the door: `str(10 // 2).zfill(2)`. | Wing B, 1st floor, door ending in 05. |

## #20 · Main Engineering Block · 1st floor · Room B109

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the letter right after A. | The door number ends in 09: the last of the nine rooms. | Main block, 1st floor, wing B, the room ending in 09. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(66)`. | Last two digits of the door: `str(3 ** 2).zfill(2)`. | Wing B, 1st floor, door ending in 09. |

## #21 · Main Engineering Block · 1st floor · Room C101

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the third letter of the alphabet. | The door number ends in 01: the very first room of that corridor. | Main block, 1st floor, wing C, the room ending in 01. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(67)`, also a language famous for pointers. | Last two digits of the door: `str(1).zfill(2)`. | Wing C, 1st floor, door ending in 01. |

## #22 · Main Engineering Block · 1st floor · Room C105

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the third letter of the alphabet. | The door number ends in 05: count the fingers on one hand. | Main block, 1st floor, wing C, the room ending in 05. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(67)`, also a language famous for pointers. | Last two digits of the door: `str(10 // 2).zfill(2)`. | Wing C, 1st floor, door ending in 05. |

## #23 · Main Engineering Block · 1st floor · Room C109

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the third letter of the alphabet. | The door number ends in 09: the last of the nine rooms. | Main block, 1st floor, wing C, the room ending in 09. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(67)`, also a language famous for pointers. | Last two digits of the door: `str(3 ** 2).zfill(2)`. | Wing C, 1st floor, door ending in 09. |

## #24 · Main Engineering Block · 1st floor · Lab C113

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the third letter of the alphabet. A lab full of computers, not a classroom. | The door number ends in 13: the number many lifts skip. Under the last desk in the back row. | Lab C113, 1st floor: under the last desk in the back row. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(67)`, and `room.type == 'lab'`. | Last two digits of the door: a baker's dozen. Then `systems[-1]`: under its desk. | Lab C113, last desk at the back. |

## #25 · Main Engineering Block · 1st floor · Lab C114

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the third letter of the alphabet. A lab full of computers, not a classroom. | The door number ends in 14: two whole weeks of days. Under the last desk in the back row. | Lab C114, 1st floor: under the last desk in the back row. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(67)`, and `room.type == 'lab'`. | Last two digits of the door: `7 * 2`. Then `systems[-1]`: under its desk. | Lab C114, last desk at the back. |

## #26 · Main Engineering Block · 1st floor · Lab C115

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Wing: the third letter of the alphabet. A lab full of computers, not a classroom. | The door number ends in 15: a quarter of an hour in minutes. Under the last desk in the back row. | Lab C115, 1st floor: under the last desk in the back row. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | Wing = `chr(67)`, and `room.type == 'lab'`. | Last two digits of the door: `0xF` in decimal. Then `systems[-1]`: under its desk. | Lab C115, last desk at the back. |

## #27 · Main Engineering Block · 1st floor · Triangle Lab (117 and 118)

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | A lab named after a shape with three sides. | Two halves, 117 and 118, behind one shared door. Under the last desk in the back row. | The Triangle Lab (117 and 118), 1st floor. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | `sides == 3`: name the shape, find its lab. | `room in (117, 118)`: one door, two sections. `systems[-1]`: under its desk. | Triangle Lab, 1st floor, last desk at the back. |

## #28 · Main Engineering Block · 1st floor · Library — IEEE papers shelf

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Inside the library, go up to its first floor. | Research papers named after four letters: I, E, E, E, plus mini projects on the same shelf. | Library first floor, front side: inside the IEEE papers and mini projects shelf, bottom row. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | `library.floor(1)`: up one level inside the library. | `'I' + 'E' * 3`: the papers shelf at the front. Bottom row. | The IEEE papers shelf on the library's first floor. |

## #29 · Main Engineering Block · 1st floor · Library — computer area

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb exactly one flight of stairs. | Inside the library, go up to its first floor. | Walk past the front seats to the back side, where computers wait for students. | Library first floor, back side: under the desk of the last system. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 2 - 1`. One flight up. | `library.floor(1).back`: the part with systems to work on. | `systems[-1]`: the last computer at the back. Look under its desk. | The computer area at the back of the library's first floor. |

## #30 · Main Engineering Block · 2nd floor · Room A201

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the first letter of the alphabet. | The door number ends in 01: the very first room of that corridor. | Main block, 2nd floor, wing A, the room ending in 01. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(65)`. | Last two digits of the door: `str(1).zfill(2)`. | Wing A, 2nd floor, door ending in 01. |

## #31 · Main Engineering Block · 2nd floor · Room A205

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the first letter of the alphabet. | The door number ends in 05: count the fingers on one hand. | Main block, 2nd floor, wing A, the room ending in 05. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(65)`. | Last two digits of the door: `str(10 // 2).zfill(2)`. | Wing A, 2nd floor, door ending in 05. |

## #32 · Main Engineering Block · 2nd floor · Room A209

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the first letter of the alphabet. | The door number ends in 09: the last of the nine rooms. | Main block, 2nd floor, wing A, the room ending in 09. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(65)`. | Last two digits of the door: `str(3 ** 2).zfill(2)`. | Wing A, 2nd floor, door ending in 09. |

## #33 · Main Engineering Block · 2nd floor · Room B201

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the letter right after A. | The door number ends in 01: the very first room of that corridor. | Main block, 2nd floor, wing B, the room ending in 01. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(66)`. | Last two digits of the door: `str(1).zfill(2)`. | Wing B, 2nd floor, door ending in 01. |

## #34 · Main Engineering Block · 2nd floor · Room B205

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the letter right after A. | The door number ends in 05: count the fingers on one hand. | Main block, 2nd floor, wing B, the room ending in 05. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(66)`. | Last two digits of the door: `str(10 // 2).zfill(2)`. | Wing B, 2nd floor, door ending in 05. |

## #35 · Main Engineering Block · 2nd floor · Room B209

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the letter right after A. | The door number ends in 09: the last of the nine rooms. | Main block, 2nd floor, wing B, the room ending in 09. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(66)`. | Last two digits of the door: `str(3 ** 2).zfill(2)`. | Wing B, 2nd floor, door ending in 09. |

## #36 · Main Engineering Block · 2nd floor · Room C201

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the third letter of the alphabet. | The door number ends in 01: the very first room of that corridor. | Main block, 2nd floor, wing C, the room ending in 01. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(67)`, also a language famous for pointers. | Last two digits of the door: `str(1).zfill(2)`. | Wing C, 2nd floor, door ending in 01. |

## #37 · Main Engineering Block · 2nd floor · Room C205

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the third letter of the alphabet. | The door number ends in 05: count the fingers on one hand. | Main block, 2nd floor, wing C, the room ending in 05. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(67)`, also a language famous for pointers. | Last two digits of the door: `str(10 // 2).zfill(2)`. | Wing C, 2nd floor, door ending in 05. |

## #38 · Main Engineering Block · 2nd floor · Room C209

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the third letter of the alphabet. | The door number ends in 09: the last of the nine rooms. | Main block, 2nd floor, wing C, the room ending in 09. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(67)`, also a language famous for pointers. | Last two digits of the door: `str(3 ** 2).zfill(2)`. | Wing C, 2nd floor, door ending in 09. |

## #39 · Main Engineering Block · 2nd floor · Lab C212

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the third letter of the alphabet. A lab full of computers, not a classroom. | The door number ends in 12: as many as the months in a year. Under the last desk in the back row. | Lab C212, 2nd floor: under the last desk in the back row. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(67)`, and `room.type == 'lab'`. | Last two digits of the door: `0xC` in decimal. Then `systems[-1]`: under its desk. | Lab C212, last desk at the back. |

## #40 · Main Engineering Block · 2nd floor · Lab C213

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the third letter of the alphabet. A lab full of computers, not a classroom. | The door number ends in 13: the number many lifts skip. Under the last desk in the back row. | Lab C213, 2nd floor: under the last desk in the back row. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(67)`, and `room.type == 'lab'`. | Last two digits of the door: a baker's dozen. Then `systems[-1]`: under its desk. | Lab C213, last desk at the back. |

## #41 · Main Engineering Block · 2nd floor · Lab C214

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Wing: the third letter of the alphabet. A lab full of computers, not a classroom. | The door number ends in 14: two whole weeks of days. Under the last desk in the back row. | Lab C214, 2nd floor: under the last desk in the back row. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | Wing = `chr(67)`, and `room.type == 'lab'`. | Last two digits of the door: `7 * 2`. Then `systems[-1]`: under its desk. | Lab C214, last desk at the back. |

## #42 · Main Engineering Block · 2nd floor · Triangle Lab (217 and 218)

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | A lab named after a shape with three sides. | Two halves, 217 and 218, behind one shared door. Under the last desk in the back row. | The Triangle Lab (217 and 218), 2nd floor. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | `sides == 3`: name the shape, find its lab. | `room in (217, 218)`: one door, two sections. `systems[-1]`: under its desk. | Triangle Lab, 2nd floor, last desk at the back. |

## #43 · Main Engineering Block · 2nd floor · Library — seating area

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Start at the biggest block on campus: the one with a leafy courtyard in its middle. | Climb two flights: the top floor. | Inside the library, go all the way up to its top floor. | No computers, no papers: only seats and silence. | Library second floor: under the last table in the seating area. |
| 2 | `campus.max(key=size)`: the main block with the garden courtyard and solar panels on the roof. | `floor = 1 + 1`. Up, then up again. | `library.floors[-1]`: the top floor of the library. | `tables[-1]`: the last table in the seating area. Look under it. | The seating area on the library's top floor, last table. |

## #44 · MBA Block · Ground floor · First workshop

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Head to the block next to the park with the benches. | Ground floor, where machines hum: a workshop. | Count the workshops from the block's main entrance: you want number one. | The card is under the workbench nearest the door. | MBA Block: the first workshop from the main entrance, under the workbench by the door. |
| 2 | `park.neighbour`: the block next to the benches. | `workshops[0]`: the first one from the main entrance. | Machines and workbenches, not desks and boards. | `door.nearest(workbench)`: look under it. | The first workshop in the MBA Block. |

## #45 · MBA Block · Ground floor · Second workshop

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Head to the block next to the park with the benches. | Ground floor, where machines hum: a workshop. | Count the workshops from the block's main entrance: you want number two. | The card is under the workbench nearest the door. | MBA Block: the second workshop from the main entrance, under the workbench by the door. |
| 2 | `park.neighbour`: the block next to the benches. | `workshops[1]`: zero-indexed, so the second one from the main entrance. | Machines and workbenches, not desks and boards. | `door.nearest(workbench)`: look under it. | The second workshop in the MBA Block. |

## #46 · MBA Block · Ground floor · Third workshop

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Head to the block next to the park with the benches. | Ground floor, where machines hum: a workshop. | Count the workshops from the block's main entrance: you want number three. | The card is under the workbench nearest the door. | MBA Block: the third workshop from the main entrance, under the workbench by the door. |
| 2 | `park.neighbour`: the block next to the benches. | `workshops[2]`: zero-indexed, so the third one from the main entrance. | Machines and workbenches, not desks and boards. | `door.nearest(workbench)`: look under it. | The third workshop in the MBA Block. |

## #47 · Canteen · Ground floor · Order counter

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Where hungry students go between classes. | It stands right next to the MBA Block. | The spot where you say what you want to eat. | Feel under the front ledge of the counter. | Canteen: taped under the front ledge of the order counter. |
| 2 | `while hungry: go()` to the building beside the MBA Block. | `order = input('What will you have?')` | The counter, not the kitchen. | `counter.ledge.under()` | The canteen's order counter. |

## #48 · Canteen · Ground floor · Seating area

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Where hungry students go between classes. | It stands right next to the MBA Block. | Not where food is cooked: where it is eaten, at the tables. | Find the last table and look under it. | Canteen seating area: under the last table (never in the kitchen). |
| 2 | `while hungry: go()` to the building beside the MBA Block. | `sit(); eat(); repeat()` | `tables[-1]`: the last table. | Look under it, never in the kitchen. | The canteen's seating area, last table. |

## #49 · Canteen · Ground floor · Drinking water station

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Where hungry students go between classes. | It stands right next to the MBA Block. | Not food: the place you fill your bottle. | Check the side of the water station. | Canteen: taped on the side of the drinking water station. |
| 2 | `while hungry: go()` to the building beside the MBA Block. | `bottle.fill(H2O)` | Stay hydrated: the water station. | `station.side`: taped there. | The canteen's drinking water station, on its side. |

## #50 · Canteen · Ground floor · Hand-wash station

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Where hungry students go between classes. | It stands right next to the MBA Block. | Before you eat, you wash your hands here. | Feel under the ledge of the basin. | Canteen: taped under the ledge of the hand-wash basin. |
| 2 | `while hungry: go()` to the building beside the MBA Block. | `hands.wash(soap=True)` before `eat()`. | The basins, not the water bottles. | `basin.ledge.under()` | The canteen's hand-wash station, under the basin ledge. |

## #51 · SVIT Cafe · Ground floor · SVIT Cafe

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | A small shop with drinks and chocolates. | It sits next to the big ground where volleyball and cricket are played. | Not the canteen: smaller, and outdoors by the ground. | Look for a poster on its wall. | The SVIT Cafe by the main ground: the poster on its wall. |
| 2 | `snack = cafe.buy('chocolate')` | `ground.neighbour`: next to the volleyball and cricket ground. | Small but mighty, like a tiny function that does one job. | `wall.poster` | The small cafe by the main ground. |

## #52 · Park · Outdoor · Park

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Green, open and full of benches. | It sits right next to the MBA Block. | Outdoors: no roof over this one. | Look under the bench nearest the MBA Block. | The park by the MBA Block: under the bench nearest the block. |
| 2 | `touch_grass()`: yes, literally. | `mba_block.neighbour`: the green one. | `benches.sort(key=distance_to_mba)[0]` | Look under it. | The park next to the MBA Block, nearest bench. |

## #53 · Basketball Court · Outdoor · Net nearest the Main Engineering Block

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | A court with two hoops, between the main block and the MBA Block. | Dribble, shoot, score: basketball. | Of the two nets, choose the one closer to the main block. | Check the back of its pole. | Basketball court: the net nearest the main block, back of the pole. |
| 2 | `court = between(main_block, mba_block)` | `sport = 'basket' + 'ball'` | `nets.closest_to(main_block)` | `pole.back` | The basketball net on the main block side. |

## #54 · Basketball Court · Outdoor · Net nearest the MBA Block

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | A court with two hoops, between the main block and the MBA Block. | Dribble, shoot, score: basketball. | Of the two nets, choose the one closer to the MBA Block. | Check the back of its pole. | Basketball court: the net nearest the MBA Block, back of the pole. |
| 2 | `court = between(main_block, mba_block)` | `sport = 'basket' + 'ball'` | `nets.closest_to(mba_block)` | `pole.back` | The basketball net on the MBA Block side. |

## #55 · Main Ground · Outdoor · Football goal post

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | The biggest open ground on campus, near the girls' hostel. | Outdoors, where teams play many games. | Kick, run, GOAL: the game with two goal posts. | Check the back of a goal post. | Main ground: the back of a football goal post. |
| 2 | `ground = max(open_spaces)`, beside the girls' hostel. | Played with feet, called football by most of the world. | `goal.post.back` | Siuuu: think of the posts, not the players. | The football goal post on the main ground. |

## #56 · Main Ground · Outdoor · Volleyball net

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | The biggest open ground on campus, near the girls' hostel. | Outdoors, where teams play many games. | Bump, set, spike: the net strung high between two poles. | Check one of the net's poles. | Main ground: on a volleyball net pole. |
| 2 | `ground = max(open_spaces)`, beside the girls' hostel. | `ball.over(net)` with your hands. | Not the goal posts, not the pitch: the high net. | `net.pole` | The volleyball net on the main ground. |

## #57 · Main Ground · Outdoor · Cricket pitch

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | The biggest open ground on campus, near the girls' hostel. | Outdoors, where teams play many games. | Twenty-two yards long, with a bowler at one end. | Look under a rock at one end of the pitch. | Main ground: under a rock at one end of the cricket pitch. |
| 2 | `ground = max(open_spaces)`, beside the girls' hostel. | `runs += 6`: the game with bat, ball and stumps. | `pitch.ends[0]` | Lift the rock there. | The cricket pitch on the main ground, under a rock at one end. |

## #58 · Girls' Hostel · Ground floor · Security guard cabin

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Find where students live, near the big ground. | The girls' one, not the boys'. | Do not go inside: find the security guard's cabin at the gate. | The card is taped on the outside back wall of the cabin. | Girls' hostel: outside back wall of the security guard cabin. |
| 2 | `home_away_from_home` for girls, next to the main ground. | `gate.guard.cabin` | Never enter the hostel: stay at the cabin. | `cabin.back_wall.outside` | The girls' hostel guard cabin, outside back wall. |

## #59 · Boys' Hostel · Ground floor · Security guard cabin

| Set | I | II | III | IV | Hint |
|---|---|---|---|---|---|
| 1 | Find where students live, on the far side of campus from the big ground. | The boys' one, not the girls'. | Do not go inside: find the security guard's cabin at the gate. | The card is taped on the outside back wall of the cabin. | Boys' hostel: outside back wall of the security guard cabin. |
| 2 | `home_away_from_home` for boys. | `gate.guard.cabin` | Never enter the hostel: stay at the cabin. | `cabin.back_wall.outside` | The boys' hostel guard cabin, outside back wall. |
