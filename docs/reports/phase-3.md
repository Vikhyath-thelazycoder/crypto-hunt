# Phase 3 · Player site — report

Date: 2026-10-24 · Status: **COMPLETED** · Plan: [IMPLEMENTATION_PLAN.md › P3](../IMPLEMENTATION_PLAN.md#p3--player-site)

`/play` is the whole player experience on a phone (and on a laptop, centred on the chart table). Every screen is built from the approved canvas mockups (docs/design/screens).

## Tasks

| ID | Task | Result |
|---|---|---|
| T-301 | Join + lobby | Join with name + team code; the crew is previewed as the code is typed ("Iron Gulls · 2 of 4 aboard"); one-time login, no password. Lobby shows 4 slots live, the code to share, captain messages. |
| T-302 | Scanner + routing + `/q/[token]` | In-site camera scanner (`@zxing/browser`, loaded only when the camera opens). Every scan result routes to its screen or message. A QR opened in a normal camera app lands on `/q` (token dropped). |
| T-303 | Solve | Own question (text, number or multiple choice), difficulty dots, hint with a +2:00 confirm, the four clue pieces with who holds each. |
| T-304 | Check in + penalty | Scan → key → wax seals 1–4/4 live; hourglass countdown that completes the round when the sand runs out; who took hints. |
| T-305 | Prank, wrong scans, pause, broadcast | Prank screen with fake key and the real clue; friendly message for every scan code; pause veil; captain broadcasts on every phone. |
| T-306 | Anti-cheat | Leaving the site while a question is open warns the player and alerts the admin (flicks under 1.5 s ignored). |
| T-307 | Eliminated / spectator / finish | Eliminated with round, X and place; Watch the race (live leaderboard) or End my hunt; Victory with rank and completion key; Hunt over if the admin ends early. |
| T-308 | Sealed mark + Final mark | Later-round QR → Sealed screen, no clue or key box; final mark asks for the printed key and the crew seal code (seal code also shown on Seek). |
| T-309 | Desktop layout | Same screens in a centred column on the dark chart table, with a header bar. |

## Evidence

| Check | Result |
|---|---|
| Unit + screen tests | 12 files, **119 passed** (screen selection, formatting, every screen's states, key input, focus guard) |
| Live database tests (test project) | 4 files, **81 passed** (incl. crew preview and the new `my_status` fields) |
| **Browser end-to-end** (`npm run e2e`, real browser vs. test project, 3 bot teammates) | **Passed**: join through the Edge Function → Lobby 4/4 → admin Start reaches the phone live → start QR opens the question → final QR in round 1 shows Sealed → answer → Seek appears live → scan mark → key → seal → round 2 on its own. No CSP violations, no console errors. |
| Visual check against the canvas | All 12 phone screens + the laptop layout screenshotted (`npm run screens`) and compared; 6 differences fixed |
| Build, lint, typecheck, `npm audit` | pass; `/play` 222 kB first load (budget 250 kB); 0 vulnerabilities |
| Production | Migrations 0009–0010 and the join function deployed; privileges re-checked; the Captain admin signs in |

## Found and fixed

1. **Check-in button stayed disabled after the key was typed** (found by the browser test). Scanning moves the team to "checking in", and that phase change cleared the scanned mark. The mark now resets only on a new round.
2. **Fonts silently fell back to Times** when Google Fonts timed out at build time. The three fonts now ship with the app (`src/fonts`, SIL OFL), so no build depends on Google.
3. Laptop background wasn't the dark chart table; Seek map showed empty space past the coast; text wrapping on Join and Solve; Lobby too tall for a phone.
4. Email sign-in had been switched off in both Supabase projects' Auth settings; re-enabled by the user.

## Not in this phase

- The Seek map is a drawn placeholder; the real venue map, ink treatment and visited marks come in P6.
- The Victory chest is the 2D drawing from the mockup; the realistic 3D chest comes in P6.
- The admin console (P4) — until then a game is set up with the scripts and RPCs.

## Next

P4 · Admin console: login, teams, locations and map editor, one-click Generate, printable QR sheet, live dashboard, controls and overrides.
