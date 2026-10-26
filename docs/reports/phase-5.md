# Phase 5 · Content: question bank & clues — report

Date: 2026-10-26 · Status: **COMPLETED** · Plan: [IMPLEMENTATION_PLAN.md › P5](../IMPLEMENTATION_PLAN.md#p5--content-question-bank--clues)

The hunt now has its real content: 321 questions, the venue's 59 places with exact hiding spots, and two clue sets for every place. Routes always send a crew to another part of campus. The cut-off strip under each printed card says exactly where the card goes.

## Tasks

| ID | Task | Result |
|---|---|---|
| T-508 | Shared round-1 QRs (D-039) | Round 1 is capped at 15 marks; more crews share them evenly. |
| T-509 | Game over pop-up (D-040) | Every phone shows the top 3 and "Return to the starting point" when the hunt ends. |
| T-501 | Question bank editor | Edit, filter and import questions from CSV with a per-row report. Questions in use mid-hunt are guarded. |
| T-502 | Seed bank | 321 hand-written questions (difficulty 1–5, multiple choice, one word and number; code answers verified by running them). **Loaded into production.** |
| T-506 | New pyramid every game (D-033) | The same printed cards; a new course each game. |
| T-511 | Placement stub (D-043) | Places have a number, building, floor and landmark (migration 0019). Each card's cut-off strip shows `#12 · building · floor · place`, the hiding spot, the landmark and "cut this strip off and throw it away". The hidden part shows only the QR and key. The same details are in the master list, the Locations editor and the crew drawer. |
| T-507 | Clue sets (D-033) | Up to 3 clues per place (migration 0020). A trigger draws a set for every crew route: it rotates with each New Game, and crews sharing a mark get different sets. The Locations editor has Clue 1–3 tabs, and the master list shows each crew's clue number. |
| T-510 | Routes far apart (D-042) | Places have a route area (migrations 0021–0022). The generator alternates the biggest area (Main Block) with the rest, so every step changes area. It links to the farthest next place by pin, and the server refuses any link that stays in one area. Production: Main Block 43, MBA area 10, North 5, Boys' Hostel 1. |
| T-503 | Venue clues | 118 clue sets (2 per place) in [venue/clues.md](../venue/clues.md): plain riddles plus small coding and meme twists. They are loaded into production. On phones, `code` parts show as code and piece cards grow to fit. |

## Venue

- [venue/locations.md](../venue/locations.md): 59 places (43 Main Engineering Block, 16 outside), from the user's list and answers. Loaded into production by place number (`scripts/places-sql.mts`).
- [venue/README.md](../venue/README.md): the campus satellite screenshots for the P6 map.

## Evidence

| Check | Result |
|---|---|
| Unit + component tests | **190 passed** (new: place formatting, 100 generated courses with no same-area step, farthest linking, area shortage message, same-area validation, ClueText) |
| Live database tests (test project) | **133 passed** (new: `clues.test.ts` (drawing, rotation per game, different sets on a shared mark, re-point, access) and `routes.test.ts` (server refuses a same-area link, accepts the generator's plan)) |
| Admin browser E2E | **Passed**: place number/building/floor/landmark, two clue tabs, every stub checked against the database, no card part names a place, no stub spills over its half page, the crew drawer says where its mark is |
| Player browser E2E | **Passed** (no regression) |
| Build, lint, typecheck | pass |
| Production | Migrations 0019–0022 applied; 321 questions, 59 places with areas, 118 clue sets |

## For the user

- Read [venue/clues.md](../venue/clues.md). Change any clue you don't like in the admin panel (Locations › Clue 1 / Clue 2).
- Seed files load only once. Later changes go through the admin panel or a migration.
