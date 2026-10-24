# Release checklist: Crypto Hunt

## 1. Before the event (once)

### Database and site
- [ ] All migrations pushed to prod; `player-join` deployed
- [ ] Vercel production deploy green; `/play`, `/admin`, `/screen` load over HTTPS
- [ ] Bot simulation 5/5 green on the test project

### Sign-in limit (must do)
- [ ] Supabase Auth per-IP sign-in/sign-up limits raised so 120 phones on one WiFi can join

### Accounts
- [ ] Admin account created (name + passcode stored safely)

### Game content
- [ ] Venue map uploaded; every location pinned with 4 clue pieces + hint
- [ ] Question bank imported and reviewed
- [ ] Team count set; Generate run; validation green
- [ ] QR sheet printed; every QR hidden at its spot (tick against the master list)
- [ ] Mobile signal checked at every spot

### Projector laptop
- [ ] `/screen` open in Chrome full screen; 3D finale tested

## 2. Rehearsal (day before)
- [ ] 2 real teams of 4 play rounds 1–2 on real phones (iOS + Android)
- [ ] Test a prank, a wrong-team scan, a hint penalty, an override, Pause and Broadcast
- [ ] In Round 1, scan a Round 3 QR and the final QR: both show "Sealed: later round", no clue; typing their keys is refused; the admin sees the alerts
- [ ] At the final QR: printed key alone is refused; key + own seal code works; another team's seal code is refused
- [ ] New Game (keep QR keys) and check every phone returns to Join

## 3. Event day runbook
1. Open `/admin` and `/screen`. Registration on.
2. Hand out team codes. Wait for every team to show 4/4.
3. Press **Start**. The universal QR shows on the projector.
4. Watch the alerts rail; set X for each round as teams progress.
5. Top 3 finish → verify their completion keys on the dashboard → prizes.
6. Export CSV.

## 4. If something goes wrong
| Problem | Fix |
|---|---|
| A phone dies | Member rejoins on another phone with the same name + code, or **Mark member inactive** |
| QR missing or damaged | **Re-point team** to a spare, or **Force complete** with a reason |
| Team stuck > 10 min | Broadcast a hint, or enable hints |
| Rain / emergency | **Pause** |
| Dispute | Timeline + audit log |

## 5. Sign-off
- [ ] Organiser
- [ ] Admin
