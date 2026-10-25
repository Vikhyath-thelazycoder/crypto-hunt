# Phase 4 · Admin console — report

Date: 2026-10-25 · Status: **COMPLETED** · Plan: [IMPLEMENTATION_PLAN.md › P4](../IMPLEMENTATION_PLAN.md#p4--admin-console)

`/admin` lets one captain set up, generate, print, run and repair a whole hunt from a laptop. The Live dashboard, Generator and Locations pages follow the approved mockups (AdminDashboard, Generator, MapEditor). Crews, Questions, Log and the print sheets reuse the same chart-table look.

## Tasks

| ID | Task | Result |
|---|---|---|
| T-401 | Login + layout + guard | `/admin/login` with admin name + passcode. A server-side guard on every other `/admin` page sends anyone signed out to the login page, and an account that isn't in `admins` back to it with a notice. Every page has a leather header with nav (Live · Generator · Locations · Crews · Questions · Log) and Sign out. |
| T-402 | Crews | Create N crews (adds more if crews exist), copy a code with one click, print code slips (8 per A4 with a QR to `/play`). Members appear live as they join. Rename crews, remove a crew (before Start, with a reason), open joining or close it. |
| T-403 | Locations + map editor | Upload the venue image (PNG/JPG/WebP ≤ 10 MB) to Storage. Click the map to pin a place and drag pins (they save on drop). Drag the handle to set the reveal radius. Edit name, hiding note, 4 clue pieces and hint, then save or remove. An unsaved-changes guard warns before switching places. A place that holds a mark in the current course can't be removed. Locations are kept across games. |
| T-404 | Generator | The course settings come from your crews (crews, decoys %, marks and advance per round, add or remove a round). A live pyramid preview shows the links, the spares, and any crew's path. The Checks panel covers full crews, enough places, paths, dead ends, missing clue pieces or pins, and question coverage per difficulty. One click applies the course, and the server re-validates it. Generating again asks first, because the printed sheet would stop working. |
| T-405 | Print | `/admin/print?sheet=qr`: two cards per A4. Each card is a QR (to `/q/<token>`) plus its key, with a cut-off placement stub (label, round, place, hiding note). `?sheet=master`: every mark with its key, place and crews. `?sheet=codes`: crew code slips. |
| T-406 | Live dashboard | Status pill with the hunt clock. Round tiles: round sealed X/Y, crews racing, open alerts, pranks sprung. Crew cards sorted by progress: phase chip, meta (pieces, "at R4-06", penalty countdown, "stuck 14m", completion key for the podium), member seals. The alerts rail turns every alert kind into words, and locked-scan alerts show the QR, its round and "their own future mark". Stuck crews (10 min in one phase) are flagged; you can acknowledge one alert or clear all. Ship's log. Updates through Realtime plus a 10 s fallback. |
| T-407 | Control bar | Only valid actions show. Before the hunt: Joining, Hints, Lockout, Broadcast, Start (disabled with the reason, e.g. "1 crew isn't full yet"). Running: Pause or Resume, Broadcast, Hints, multiple-choice Lockout (0:30–15:00), advance stepper for any open round, Export CSV, End game (typed END + reason). Finished: Broadcast, Export, New game. Lowering X to the crews already sealed asks first ("eliminates 2 crews", typed SEAL) and checks fresh numbers from the server first. |
| T-408 | Overrides + audit + export | Clicking a crew card opens: members (mark inactive or active, remove), move to round, re-point to another mark of the round (spares first), complete the round by hand (typed COMPLETE), disqualify (typed DISQUALIFY). Each needs a reason and writes an audit row. `/admin/log` shows the full log with the captain's actions and reasons, a per-crew filter and a download. Export CSV gives teams, round times, ranks, the log and the audit in one file (formula-safe). |
| T-409 | New Game | Typed NEW GAME, a "Download CSV first" prompt, and an optional "regenerate every QR" box with a reprint warning. It's on the Live bar once the hunt is finished, and on the Crews page any time. |

## Database (migration 0013, test + production)

- Storage bucket `venue`: public read (the image has no pins); only the admin uploads, replaces or deletes; PNG/JPG/WebP, 10 MB.
- `admin_snapshot()`: the whole dashboard in one consistent read (admin only).
- `ack_all_alerts()`: clears the alerts rail (admin only).
- Explicit grants (D-028): `authenticated` only, and both functions check `is_admin()`.

## Evidence

| Check | Result |
|---|---|
| Unit + component tests | 14 files, **162 passed** (41 new: login gate, error words, every alert kind, log lines, dashboard sorting/cards/stuck/penalty/start/seal rules, course checks and pyramid layout, CSV, QR round-trip; login, typed confirms, control bar states, dashboard, overrides) |
| Live database tests (test project) | 7 files, **109 passed** (16 new in `integration/admin.test.ts`: snapshot is admin-only and correct, alerts with places, each override + its audit row, re-point follows links, kick, disqualify, set X audited, no removal mid-hunt, location in use can't be deleted, players can't write venue content, Storage: admin-only upload, public read, images only) |
| **Browser end-to-end** (`npm run e2e:admin`, real browser vs. test project, 3 bot crews) | **Passed** twice. Login guard (incl. the print page), a non-admin refused, crews created and members appearing live, rename, code slips, map upload, a place added and pinned, pin dragged, course generated and re-validated, QR sheet with every QR exactly once (14 cards on 7 A4 pages, PDF checked; no label/round/decoy on the hidden cards), master list with every key, Start, live updates, alert ack, hints/lockout/broadcast/pause/resume, overrides with audit reasons, X lowered with the seal confirm, podium with the completion key, CSV export, Log page, New Game (old phone → NOT_REGISTERED), sign out. No CSP violations; the only failed request is the deliberate wrong passcode. |
| Dashboard latency (goal ≤ 2 s) | 0.1–1.1 s from the server's answer to the dashboard, across every E2E run |
| Player E2E (`npm run e2e`) | Still passes (no regression) |
| Visual check against the canvas | Live, Generator, Locations, Crews and Print screenshotted (`screens-out/admin-*.png`) and compared; 3 differences fixed (background stopping at the first screen, round tile after the finish, log length) |
| Build, lint, typecheck | pass; `/play` still 222 kB first load (the admin code is split per route) |
| Production | 0013 applied; an anonymous `admin_snapshot` call is refused; the `venue` bucket exists |

## Found and fixed

1. **Printed cards would have leaked the round and the decoys.** A label like `R3-02` or the word DECOY on a hidden card tells players what the round lock and pranks are meant to hide. The hidden card now shows only the QR and key, and the rest goes on a cut-off stub and the master list (D-031).
2. **Lowering X on stale numbers could seal a round without the confirm.** If the dashboard was a moment behind, the "eliminates N crews" warning might not appear. The stepper now reads fresh numbers from the server before deciding (found by the browser test).
3. A test-only clock-skew flaw in `mcq.test.ts` (database clock vs. laptop clock, 300 006 ms vs. a 300 000 ms ceiling): it now allows 2 s of skew.
4. `realtime.test.ts` failed once in the first full run and passed in the next three; it's a known slow-start flake of the test (Realtime takes a moment after subscribing).

## Not in this phase

- **Questions page is read-only** (coverage per difficulty and format, the list without answers). Adding, editing and CSV import are T-501 (P5).
- Printed QR cards haven't been scanned by real phones yet: that's T-804 (venue rehearsal). The encoded URL is checked by a unit test against the scanner's parser.
- Vercel is still not deployed.

## Next

P5 · Content: questions CRUD + CSV import, the seed question bank, and location clues once you send the venue and its places.
