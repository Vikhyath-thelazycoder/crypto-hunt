# Phase 2 · Game engine & database — report

Date: 2026-10-24 · Status: **COMPLETED** · Plan: [IMPLEMENTATION_PLAN.md › P2](../IMPLEMENTATION_PLAN.md#p2--game-engine--database)

The whole hunt now runs on the server. Everything below is live on the **test** project (`crypto-hunt-test`). **Production has not been touched**; it gets the same migrations at release.

## Tasks

| ID | Task | Result |
|---|---|---|
| T-201 | `engine.ts` pure rules | Pyramid counts, default X, difficulty, scan resolution (incl. round lock), check-in outcome, round close, end-game ranking. |
| T-202 | `generator.ts` | Seeded pyramid builder + validator. Property-tested: valid for 1–40 teams × 25 seeds; every team reaches the final; spares left in round 1; clear error when locations run short. Question picks moved to the server (see Decisions). |
| T-203 | Schema (0001) | 21 tables, constraints, indexes, 4-member trigger, `scan_tickets`, `final_code`. |
| T-204 | RLS (0002) + grants (0007) | Players read only their own `team_state` row and `public_state`. Every function privilege explicit (see Found and fixed). |
| T-205 | `player-join` Edge Function | Deployed to test. One-time login token + single-use claim nonce; same name = session move + alert. |
| T-206 | Player RPCs (0004) | `my_status`, `scan_qr`, `submit_answer`, `use_hint`, `submit_key`, `complete_round`, `report_focus_event`, `set_eliminated_view`, `claim_session`. |
| T-207 | Admin RPCs (0005) | Teams, plan apply (re-validated in SQL), start, pause/resume, broadcast, hints, set X, end game, 6 audited overrides, alerts, export, New Game. |
| T-208 | Realtime | `public_state`, `team_state`, `events`, `alerts`, `teams`, `players`, `round_results` published; tested live. |
| T-209 | Admin bootstrap | `scripts/create-admin.mts` creates the admin and proves the login works. |
| T-210 | Round lock (D-025) | Later-round scan → `LOCKED_MARK`, identical for own/other QRs, nothing stored; key needs a scan ticket; alerts + possible-sweep. |
| T-211 | Final seal code (D-026) | Per-team code after the final clue; final check-in = scan + printed key + own seal code. |

## Evidence

| Check | Result |
|---|---|
| Unit tests (`npm test`) | 9 files, **84 passed** |
| Integration tests on the test project (`npm run test:integration`) | 4 files, **79 passed**, run twice (no flakes) |
| Typecheck, lint, build, `npm audit` | pass / pass / pass / 0 vulnerabilities |
| Supabase security advisor | Only the expected "signed-in users can run SECURITY DEFINER" notes for the 32 intended API functions (each checks the caller). 2 search_path warnings fixed in 0008. |
| Supabase performance advisor | Hot foreign keys indexed in 0008; remaining notes are informational. |
| Leftover test accounts after a run | 0 (global teardown) |

What the integration tests prove, on the real database:
- **Full hunt:** 3 crews, 4 rounds; universal QR opens round 1; answers matched ignoring case/spaces/accents and alternatives; four pieces → clue + map region (never the exact pin, stable between refreshes); all 4 members scan + key; hint penalty served before the round counts; pause blocks play; X = 2 eliminates the third crew instantly; 1st and 2nd place, completion keys, game finishes; export; New Game with and without regenerating QRs.
- **Round lock:** in round 1, the crew's own round-3 QR, another crew's round-2 QR and the final QR all return the same `LOCKED_MARK`; the correct printed key of a later QR is refused; nothing is stored, and the early scan doesn't count later; the admin sees each scan (flagged when it's the crew's own future mark) and a possible-sweep alert at 3.
- **Final seal:** the code appears only after the final clue, differs per crew; printed key alone → `BAD_SEAL`; another crew's code → `BAD_SEAL` + alert; own code → finish.
- **Security:** players read 0 rows from 18 secret tables; public state holds no codes, keys or places; `my_status` has no answers, tokens or other crews' data; players can't write tables; 8 admin RPCs → `NOT_ADMIN`; internal helpers and join functions → permission denied; forged plans rejected; 11th answer / 6th key in a minute → `RATE_LIMITED` + alert; double check-in counts once; lowering X closes the round at once.
- **Join function:** bad name/code refused; join without a password; claim nonce single-use; rejoin moves the session (old phone `SESSION_MOVED`, admin alerted); 5th member `TEAM_FULL`.
- **Realtime:** the projector (anonymous) receives the broadcast; a phone receives only its own team's row.

## Found and fixed during the phase

1. **Every function was callable by anyone (test project only).** Supabase's default privileges grant EXECUTE on new functions to `anon` and `authenticated`, and the revoke in 0002 only covered the role that ran it. So a player could have called `_complete_round` or `join_commit` directly. Migration 0007 revokes everything and grants exactly the API; a regression test guards it (SECURITY T20, D-028).
2. **Whole-table deletes refused** by Supabase's safe-update guard on API requests (plan apply, New Game, end game, resume). Fixed in 0007 with explicit `where true`.
3. **Session claim always failed**: the nonce was compared with the printed-key normaliser, which strips `-`/`_`. Exact hashed comparison in 0006.
4. The first two migrations were applied through the MCP under timestamp names; the CLI history was repaired to `0001`/`0002` (history only, no schema change).

## Decisions made in this phase

- **D-027 New Game** (supersedes D-020): teams kept with new codes and new routes; printed QRs and keys kept unless "Regenerate QRs"; seal codes always new.
- **D-028 Function privileges**: every RPC granted explicitly.
- Player RPCs **raise** for guard failures and **return** `{ok:false, code}` for game outcomes, so alerts and rate-limit counts aren't rolled back. Admin RPCs raise.
- The server picks each member's question at round start (never repeated within a team), not the generator.
- Rejoining with the same name moves the session (F1/T11); `NAME_TAKEN` only if a different account holds that name.

## Not in this phase

- No screens yet (P3 player site, P4 admin console, P7 projector).
- Production database and Edge Function are not deployed; the admin account isn't created on production.
- Event Wi-Fi: Supabase Auth's per-IP limits (sign-ins / token verifications) must be raised before the event (RELEASE_CHECKLIST).

## Next

P3 · Player site: join, lobby, scanner, Solve / Seek / Check in / Penalty / Sealed mark / Final mark screens, matching the canvas mockups.
