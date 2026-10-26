# Phase 7 · Projector screen — report

Date: 2026-10-26 · Status: **COMPLETED** · Plan: [IMPLEMENTATION_PLAN.md › P7](../IMPLEMENTATION_PLAN.md#p7--projector-screen)

`/screen` is the audience view. Open it full screen on the laptop that drives the projector; it needs no sign-in. It reads only the public state, so it never holds a key, code, pin or place name. It follows the race from start to finish:

- **Before the start:** "Crews gather", how many crews are aboard, their ships in the harbour, and the players' join QR.
- **At the start:** the universal QR fills the screen for the first 3 minutes. After that it moves to a corner, where it stays while round 1 is open, for late players.
- **During the hunt:** the round being decided and its seals, the campus map with a ship per crew, the leaderboard, and a LATEST ticker. The ticker also shows the captain's broadcasts. A "Paused" sign covers the map while the hunt is paused.
- **When a round closes:** a "Round II sealed" splash names who advanced and who is out.
- **At each finish:** the Blender chest opens above the podium for 25 s.
- **At the end:** the Game over splash shows the top 3 and "Return to the starting point", then the finale stays on screen.

## Tasks

| ID | Task | Result |
|---|---|---|
| T-701 | Live leaderboard | `LiveScreen.tsx` and `src/lib/screen/board.ts` (pure logic, unit-tested). Rows show the rank, crew, a pip for each round and what the crew is doing ("Round V · solving", "Seeking the mark", "Checking in 3/4", "Penalty 1:12" counting down). Crews that have sealed the live round turn gold. Crews that are out are grouped by round. Rows reorder with a FLIP spring. Names stay at 48 px: with 25 crews the tail folds into "+N more crews". Data comes from `usePublicState`: Realtime pushes, plus a re-read every 10 s and on reconnect. An older read never overwrites a newer one (`event_seq`). |
| T-702 | Ships on the map | The real campus map, tilted on the chart table, with one ship per racing crew. Ships wait in the harbour. Once a round **closes**, each ship sails to the region of the crew's last closed round (**D-045**). That region uses the same offset as the phone's visited region, never the pin. An open round's marks are never shown, because other crews may still be seeking them. Eliminated crews lose their ship. |
| T-703 | Splashes | Start QR (the `/q/<token>` link, read by the in-site scanner), join QR before the start, round sealed, crews out (when a crew is knocked out outside a round close), Game over (D-040). Splashes queue: each one stays 9 s, Game over stays 14 s. Game over replaces anything that closed at the same moment. |
| T-704 | Finale | `FinaleScreen.tsx`: god rays, the Blender chest (the same `ChestStage` as the Victory screen, now shared), and the podium with times and the winner's members. It plays after each finish with "Still racing" on the empty pedestals, and stays once the game is over ("Unclaimed" if fewer than 3 finished). |

**Migration 0026** (test + production): `public_state` also carries the venue map, each crew's `ship`, `finish_ms` and `crew` (names, finished crews only), and `latest` (the last 6 public events: round sealed, fog lifted, penalty, out, treasure, round closed, start, end).

## Evidence

| Check | Result |
|---|---|
| Unit + component tests | **222 passed** (new: 14 for the board logic, 8 for the projector: 48 px rows, ships, Paused, broadcast, join QR, start QR, round splash clears, finale returns to the race, Game over stays, recovery from a missed Realtime event within 10 s, older state ignored) |
| Live database tests | **148 passed**, including the new `projector.test.ts`: anon read; ship stays docked while the round is open; after it closes the ship matches the phone's visited region; eliminated crews have no ship; the winner's time and members; no pin, place, key or code in the public state |
| Admin browser E2E (whole hunt) | **Passed** with `/screen` open signed out beside it. Start QR encodes the real universal token; broadcast and Paused show; "Round I sealed" names the crews out; Game over with the top 3, then the chest and podium. **60 fps** on the projector page; no CSP violations |
| Player browser E2E | **Passed** (the Victory chest now uses the shared `ChestStage`) |
| Build | `/screen` first load 220 kB; the 3D code loads only when the finale plays |
| Screenshots | `npm run screens` now also shoots the projector views at 1920 × 1080 for side-by-side checks with ScreenLive / ScreenFinale |

## Differences from the mockups

- **No "Key verified" line on the podium.** No key check is stored: the captain reads each winner's completion key on the dashboard (D-040). Adding the line would need a new admin action. Say if you want one.
- The map is the real campus map, which is wider than the mockup's sketch (1800 × 792), so it is tilted 30° instead of 40° and spans the full width.
- Added beyond the mockups: the gathering view with the join QR, the start QR splash, the Paused sign, "FROM THE CAPTAIN" in the ticker, and the splashes.

## For the user

- On the event day, open **https://crypto-hunt-git-main-crypto-hunt.vercel.app/screen** on the projector laptop and make the browser full screen (F11 / ⌃⌘F). It scales to any screen.
- The test project's `venue` bucket had lost `campus-map.jpg`. I uploaded it again (test only; production already had it).
