# Flaw report (P8 · T-807)

Every problem found by the bot runs (`npm run bots`), the rule checker, the attack suite, the load runs and the manual security review. Each one has a severity, how to reproduce it, the fix and the retest. Runs and logs are in [runs/](runs/).

Severity: **blocker** (the event can't run) · **major** (wrong result or a broken screen for some players) · **minor** (an error message or a delay, nothing wrong in the game) · **cosmetic**.

## Summary

| ID | Severity | Area | What | Status |
|---|---|---|---|---|
| F-01 | blocker | performance / joining | 40 of 100 players refused ("too many attempts") when a hall joins from one Wi-Fi address | **Fixed** (0028), retested |
| F-02 | major | rules / projector | Crews still in an earlier round were "out in round V"; earlier rounds were never closed, so the projector and dashboard showed the wrong round | **Fixed** (0028), retested |
| F-03 | minor | rules | A kick at the instant of a scan gave that phone a server error instead of "signed out" | **Fixed** (0028), retested |
| F-04 | minor | joining | The join function sometimes failed to boot under a burst (BOOT_ERROR); the player had to tap Join again | **Fixed** (the Join screen retries once), tested |
| F-05 | major | performance | Under 100 players, actions timed out (15 server errors in one run); check-ins took up to 7.7 s | **Fixed** (0029), retested |
| F-06 | cosmetic | UI | A crew knocked out in the same instant as a member's key press sees "scan the mark again" for a moment before the Eliminated screen | Accepted (see below) |
| F-07 | minor | performance | When 100 players press Join in the very same second, the last ones wait up to ~12 s | Accepted (see below) |
| F-08 | minor | performance | In the first minute after Start, when every player scans the start QR at once, the slowest 5 % of scans wait ~3 s | Accepted (see below) |
| F-09 | cosmetic | UI | No site icon: browsers asked for /favicon.ico and got 404 | **Fixed** (`src/app/icon.svg`) |
| F-10 | major | rules / performance | Deadlock when many crews finish a round at once (120 players: "deadlock detected", 9 actions timed out) | **Fixed** (0030), retested |
| F-11 | minor | performance | At the busiest moment with 120 players, actions queue 1–3 s on the shared leaderboard row; 2 of 2 229 waited past the 8 s limit | Accepted (see below) |

## Findings

### F-01 · blocker · Joining from one address is rate-limited at 60 a minute
- **What happened:** every phone at the event shares the venue Wi-Fi's one public address. The join function allowed 60 code lookups and joins per address per minute. In the first 100-bot run, 40 of 100 players were refused at their first try, and it took 67 s and 417 refused requests before all were in.
- **Reproduce:** `python simulate.py --teams 25` with the old limit (run `sim-25-third`: `first_try_refused: 40`, `RATE_LIMITED: 417`).
- **Fix:** migration 0028 raises the limit to 600 per address per minute (a hall of 100–150 phones with a lookup, a join and retries each fits; guessing a 6-character code at 600 a minute still takes years). The attack suite checks that 700 lookups in a minute are still stopped, and that a forged `X-Forwarded-For` header can't dodge the limit.
- **Retest:** runs `sim-25-fixed` and `sim-25-settle`: 100/100 joined in 16 s, **0 rate-limit refusals**. `integration/botfixes.test.ts` (200 a minute pass, a flood is stopped).

### F-02 · major · A later round filling first left earlier rounds open
- **What happened:** with 25 crews, the leaders can fill Round II (X = 14) while Round I (X = 18) still has crews in it. Closing Round II correctly knocked out the crews still in Round I (they can no longer reach the podium), but recorded them as "out in Round II" (or V, VI …), and Round I was never marked closed. The projector and dashboard then showed "Round I · eighteen crews advance" while the race was in the final.
- **Reproduce:** the first 6-crew and 25-crew runs; the rule checker reported "a round was left open after a later round closed" and "'out in round N' is not the round the crew was in" (20 crews).
- **Fix:** migration 0028: closing a round also closes every earlier round still open, and each crew it knocks out is out in the round it was actually in. The projector shows one "Round … sealed" splash for rounds closing together.
- **Retest:** the rule checker finds nothing in `sim-25-fixed` and `sim-25-settle` (7 of 7 rounds closed, every crew out in its own round). `integration/botfixes.test.ts`; `src/lib/screen/board.test.ts`.

### F-03 · minor · A kick racing a scan gave a server error
- **What happened:** the admin kicked a player at the instant that player's phone scanned. The scan failed with `events_player_id_fkey` (HTTP 409) instead of `NOT_REGISTERED`.
- **Reproduce:** first 6-crew run (Omar 4, Copper Owls).
- **Fix:** migration 0028: the session check holds a key-share lock on the player row, so a kick waits until the phone's call has finished.
- **Retest:** attack `test_kick_racing_a_scan_never_errors` (a scan storm while kicking two players) passes; no foreign-key errors in later runs.

### F-04 · minor · The join function failed to boot under a burst
- **What happened:** with 100 joins in one second, Supabase occasionally answered `BOOT_ERROR` (1–4 times a run) while starting more copies of the join function. The phone showed an error and the player had to tap Join again.
- **Fix:** the Join screen retries once after 1.2 s when the function fails with a server error (`src/lib/player/api.ts`; `src/lib/player/join.test.ts`). A refused code is never retried.
- **Retest:** unit tests; the bots retry the same way and all 100 got in every run.

### F-05 · major · Actions timed out under load (lock queue)
- **What happened:** in the first run with human pacing, 15 actions failed with `canceling statement due to statement timeout` and the slowest 5 % of check-ins took 7.7 s. The Postgres log showed actions waiting up to 6 s on each other's row locks. Every player action first settles the crews whose penalty has run out. When a crew's penalty ended, every concurrent action queued on that crew's row to settle it.
- **Reproduce:** run `sim-25-fixed` (`http_5xx: 15`; `submit_key` p95 7 696 ms; Postgres log "still waiting for ShareLock on transaction …").
- **Fix:** migration 0029: one action settles a crew and the others skip it (`FOR UPDATE SKIP LOCKED`), re-checking the crew's state after the lock so it is never completed twice.
- **Retest:** run `sim-25-settle`: **0 server errors**; p95 `submit_key` 614 ms (was 7 696), `scan_qr` 369 ms (was 6 627), `submit_answer` 467 ms (was 4 879), `my_status` 434 ms; the rule checker finds nothing.

### F-06 · cosmetic · Key pressed in the instant the crew is knocked out
- **What happened:** two crews pressed a key in the same instant that their round closed. The key was refused with `NOT_SCANNED`, the message for "scan the mark again", not `ELIMINATED`. Their phones show the Eliminated screen a moment later.
- **Accepted:** it only happens in the same instant as the round closing, the outcome is right, and the screen corrects itself within a second.

### F-07 · minor · A whole hall pressing Join in the same second waits up to ~12 s
- **What happened:** 100 joins in one second take 16 s in total (p95 12 s per player): the join function creates an account and a one-time login for each player, and Supabase Auth works through them in turn.
- **Accepted:** at the event players join over several minutes while crews form, and the Join button shows progress. Nothing is refused.

### F-08 · minor · A few seconds' wait in the first minute
- **What happened:** in the 30-crew load run (120 players), status and scan calls were slow only in the first minute after Start, when everyone scans the start QR together (server p95 3.8 s, typical 2.2 s). Every later minute: p95 0.1–0.3 s, typical 0.02–0.03 s (Supabase edge logs, `response.origin_time`).
- **Accepted:** people take their time to scan; a few seconds at the very start doesn't change the race, and nothing fails (0 server errors).

### F-09 · cosmetic · No site icon
- **What happened:** the demo's projector logged a 404 for `/favicon.ico`. **Fix:** `src/app/icon.svg` (a wax seal with a compass needle), served by Next.js as the site icon.

### F-10 · major · Deadlock when a round fills while other crews check in
- **What happened:** in the 30-crew load run (120 players), the Postgres log showed `deadlock detected` and 9 actions failed with statement timeouts during the game. Crew A's check-in took the round's last place: it held the round's row and went to knock out crew B (crew B's progress row). At the same instant crew B's check-in held its own progress row and waited for the round's row.
- **Reproduce:** `npm run bots` run `2026-10-27-0656`, step `load` (`http_5xx: 9`); Supabase Postgres log 01:45–01:47 UTC.
- **Fix:** migration 0030: check-ins, penalty settling and the admin's X change and force-complete first take one shared "round progress" lock, so every path locks in the same order. The original functions are renamed (`_submit_key_body` …) and wrapped; their bodies are unchanged.
- **Retest:** run `2026-10-27-0720`: no `deadlock detected` in the Postgres log; load step 2 timeouts in 2 229 calls (was 9), 0 rule findings; integration 153/153; attacks 172/172 (the renamed bodies can't be called from outside).

### F-11 · minor · Queueing on the leaderboard row at the busiest moment
- **What happened:** every player action also rewrites the one public leaderboard row, so at peaks with 120 players actions wait 1–3 s for each other (Postgres log: "still waiting for ShareLock on transaction"). In run `2026-10-27-0720`, 2 of 2 229 calls (0.09 %, both answer submissions) waited past Supabase's 8 s statement limit and failed; the phone shows an error and the player taps again.
- **Accepted, following the user's guidance (2026-10-27) that real players take their time:** real players are slower than the bots; the outcome is never wrong (0 rule findings). A fuller fix would update the leaderboard asynchronously, a redesign not worth its risk before the event.

## Checked and clean
- **Rules** (the rule checker, independent of the game code): elimination and X, ties at X (13–22 same-second completions a run), hint and wrong-answer penalties to the second, pause freezing penalties, penalty overtaking, the round lock, multiple choice (no hints, swapped questions never return), routes far apart, card stubs vs `docs/venue/locations.md`, the podium and unique completion keys. Its own tests catch every planted bug (19 tests).
- **Attack suite:** 168 attacks (`scripts/sim/attacks/`), all refused as SECURITY.md says: every table read, written and deleted as a player and anonymously; every admin RPC and every internal helper as a player and anonymously; Storage upload, overwrite and delete; a forged service-role token; another crew's mark, task and seal; later-round and final marks and keys; prank keys; key guessing and answer brute force (rate-limited, the penalty still counted); tapping every multiple-choice option; one member checking in for the crew; replayed and expired scan tickets; cutting a penalty short; a 5th member; made-up codes; bad names; forged `user_id`/IP in the join body; a forged `X-Forwarded-For`; a second phone (session moved + alert); injection and script in answers, keys, broadcast and crew names; pause; inactive, kicked and eliminated players; two phones answering at once; double `complete_round`; New Game signing every phone out.
- **Manual review (T-802):** row-level security policies read line by line (players see only their own progress row and the public state; everything else is admin-only; Storage writes are admin-only); the live site sends CSP with nonces, HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a camera-only permissions policy; the git history has no secret keys (one match is a fake value inside a unit test that checks secret keys are rejected); `.env*` files were never committed (only `.env.example`).
- **Not product flaws, but fixed in the test harness:** network blips crashing a bot run (retries added), the admin E2E replacing the test project's venue map (the bot setup restores it).
