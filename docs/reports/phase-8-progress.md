> **Superseded:** P8 finished on 2026-10-27; see [phase-8.md](phase-8.md). This note is the mid-phase handoff, kept for the record.

# Phase 8 · Bot testing, hardening & release: progress (paused 2026-10-27)

Status: **IN_PROGRESS**. Paused at the user's request (usage limit). Read this first when resuming.

## Done so far

### Bot test tooling (`scripts/sim/`, Python venv + Playwright)
| File | What it does | State |
|---|---|---|
| `lib.py` | Talks to the TEST project like a phone or the admin does (join function, one-time login, RPCs); refuses production; retries network blips | Works |
| `world.py`, `world_cli.py` | Wipes the test project and loads the real venue (59 places, 118 clue sets, 321 questions, campus map, restoring the map image if missing); makes a fresh admin | Works |
| `venue.mts`, `plan.mts` | The real venue as JSON; the course from the app's own generator | Works |
| `simulate.py` (T-801) | 25 crews × 4 = 100 bots, all joining in the same second from one IP; personalities (careful, guessers, hint takers, tie pair, prank chasers, medium, slow); admin bot (hints, broadcast, inactive, kick, pause/resume, lower X live); human pacing (`--pace`) | Works. **5 runs done** (folders in `docs/reports/runs/sim-25-*`) |
| `oracle.py` + `test_oracle.py` (T-810) | Independent rule checker (elimination/X, ties, penalties to the second incl. pause, finish order, round lock, multiple choice, routes far apart, card stubs vs locations.md, podium) | Works; **19 tests pass**, every planted bug caught |
| `attacks/` (T-806) | 168 attacks: table read/write/delete as player and anon, every admin RPC and internal helper, Storage, forged JWT, game cheats, rate limits, joining, injection/script input, pause/inactive/kick/eliminated, races, New Game | **168 / 168 pass** |
| `run_all.py` (T-809) + `watch.mts` | `npm run bots`: lint, typecheck, build, unit, integration, e2e ×2, rule-checker tests, simulation (admin + projector watched in browsers), attacks, load (30 crews), scans | Written, **not yet run end to end** |
| `demo.mts` (T-808) | `npm run demo`: 10 screens recorded at once (admin, projector, Iron Gulls × 4 phones, Black Tide × 4 phones) on the real UI, with phones scanning through the real in-site scanner (fake camera per phone) | **Not finished**: see "Demo video" below |

npm scripts added: `bots:setup`, `bots`, `demo`.

### Flaws found and fixed (details: [flaws.md](flaws.md))
| ID | Severity | What | Fix | Retested |
|---|---|---|---|---|
| F-01 | blocker | 40 of 100 players refused when a hall joins from one Wi-Fi address (limit 60/min/IP) | 0028: 600/min/IP | ✅ 0 refusals |
| F-02 | major | Crews stuck in an earlier round were "out in round V"; earlier rounds never closed, so the projector/dashboard showed the wrong round | 0028: close earlier rounds, out in own round; projector shows one splash | ✅ rule checker clean |
| F-03 | minor | Kick racing a scan → server error | 0028: key-share lock in the session check | ✅ attack test |
| F-04 | minor | Join function BOOT_ERROR under a burst | Join screen retries once (`src/lib/player/api.ts`) | ✅ unit tests |
| F-05 | major | 15 timeouts under 100-player load; check-ins up to 7.7 s (lock queue on penalty settling) | 0029: settle with SKIP LOCKED | ✅ 0 errors, check-in p95 0.61 s |
| F-06 | cosmetic | Key pressed in the instant the round closes says "scan again" for a moment | Accepted | — |
| F-07 | minor | 100 joins in the same second: last ones wait ~12 s | Accepted | — |

**Migrations 0028 and 0029 are applied to test AND production.** Full integration suite after them: 153/153 pass.

### Manual security review (T-802), done
RLS policies read; live site headers (CSP with nonce, HSTS, X-Frame-Options DENY, nosniff, referrer, permissions) all present; git history has no secret keys; no `.env` file ever committed.

## Demo video: what went wrong and what to do next
Getting through: captain sign-in, 8 phones join and name crews, course, Start, hints on + broadcast, **all 8 phones scan the start QR through the real scanner**, Round I answers (misses + hint), Leela's later-round-mark cheat (sealed + alert), Omar's prank (Fooled!), alert acknowledged, Iron Gulls' first member checks in.

Problems hit and fixed in `demo.mts`:
1. Two demo runs overlapped (the first was still saving videos) → added a lock file `docs/demo/.demo.lock`.
2. Projector drawn in software at 97 % CPU → full Chromium on the GPU for the projector, and every screen recorded at its grid size.
3. This ffmpeg has no `drawtext` → captions and labels are now drawn as PNGs by the browser and overlaid.
4. Scans read late → patient retry (`scanWith`).
5. **Last fix, not yet verified:** once one member checks in, teammates' phones jump to the check-in scanner by themselves with a stale camera image, so there is no "Found it" button. `openCheckIn()` now goes back and reopens the scanner (or reloads). **The next run should show whether this works.**

Next steps for the demo:
- Run `npm run demo` alone (nothing else running; delete `docs/demo/.demo.lock` if a dead run left it). Follow the log; on a stop it saves `docs/demo/.work/stopped-*.png` for every screen.
- Expect Round II/final steps to need the same small fixes (texts like "PENALTY", "Watch the race", "Press both seals" are taken from the code but not yet seen running).
- Output: `docs/demo/demo.mp4` + `docs/demo/demo-steps.md`. Closing the browsers can take several minutes while videos save.

## What is left in P8
| Task | Left to do |
|---|---|
| T-808 demo | Finish as above; the user watches it |
| T-809 `npm run bots` | First full end-to-end run; fix anything in the runner (e.g. `supabase db lint` flags, watch.mts sign-in) |
| T-807 loop | Two clean full runs in a row; update `flaws.md` with anything new |
| T-803 load | Comes from `run_all.py`'s 30-crew "load" step (p95 target < 500 ms; current gameplay p95 0.37–0.61 s) |
| Docs | Plan statuses, `docs/reports/phase-8.md` final report, commit + push to `main` |
| T-804 | Real-phone test at the venue (user, people at the venue) |
| T-805 | Release checklist + sign-off (user) |

## Not committed yet
All P8 work (scripts/sim, migrations 0028–0029, flaws.md, this file, src fixes) is **uncommitted on disk**. Commit and push when resuming (or when the user asks). Don't commit `docs/demo/.work/`, `scripts/sim/.venv/` (ignored) or the `docs/design/blender/chest.blend` / `.blend1` changes.
