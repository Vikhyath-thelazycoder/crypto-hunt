# Phases 10–12: crash fixes, new game, new screens

Status of the 20 problems found after the 2026-10-30 crash. "Checked" says what has actually been run. None of this has been run with a crowd: the user decided on 2026-10-31 to skip the load and bot tests.

| # | Problem | Fix | Checked |
|---|---|---|---|
| 1 | One queue for all check-ins | Each check-in locks only its own round, and only to take a place | One crew, in a rolled-back transaction |
| 2 | Slow check-ins (912 ms) | One lean request a round | 6 ms for one crew, no crowd |
| 3 | Status checks joined the queue | Status is read-only | Same test: 9 ms, no crowd |
| 4 | Leaderboard rebuilt on most actions | Rebuilt every 5 s, and only saved when it changed | 11 ms before trimming, no crowd |
| 5 | Full leaderboard sent to every phone | Projector and endings only | Code; browser game |
| 6 | Costly live updates | Empty pings per crew; table changes off | Real browser: question in 0.5 s |
| 7 | Admin page reloaded on every change | Reads every 5 s | Code |
| 8 | Phones checked every 15 s | 60 s backup, ±30 % | Unit test |
| 9 | Fast retries | 5 s doubling to 60 s, random spread | Unit test |
| 10 | 4 phones per crew | One phone: a second name is refused | Database test |
| 11 | Login check on every page | Admin pages only | Code; browser game |
| 12 | Players knocked out in an outage | Removed the middleware's token refresh race; "Reconnecting" state | Code only; no outage test |
| 13 | 518 status calls without a login | No call without a session | Code only; cause not proven |
| 14 | Many joins at once | One join per crew; Auth limits raised for one campus IP | Config; no crowd |
| 15 | Game sized for 10 crews | Crews split evenly across 6 groups; round 1 stays at 15 cards (user's choice), so crews share cards | 100 generated courses at each of 5, 10, 43, 80, 100 crews |
| 16 | Game built for 4 phones | Rebuilt | Browser game; rolled-back round with real riddles |
| 17 | Test wasn't realistic | Tool built (`scripts/sim/load.py`) | **Not run on the new game: user's decision** |
| 18 | Warnings accepted as minor | No pass mark can apply without a test | **Not done: user's decision** |
| 19 | Nobody watching | `docs/EVENT_SHEET.md` | Needs a person on the day |
| 20 | No crash plan | `docs/EVENT_SHEET.md` | Needs a person on the day |

Also removed from every status check and leaderboard rebuild: map, ships, fog regions and per-member check-ins (migration 0037).

Not updated for the new game: `integration/`, `scripts/sim/attacks/`, `scripts/sim/oracle.py`, `scripts/e2e-*.mts`, `scripts/sim/demo.mts`. They still describe the old game and won't pass.
