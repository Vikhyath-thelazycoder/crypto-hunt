# Phase 9: Realistic load test tool

`scripts/sim/load.py` plays a full game with bots that behave like real phones: each holds a live Realtime connection, refetches when told to, runs the background checks and loads pages, with the admin page and projector open. It refuses the production project.

## Result on the code that crashed (T-902)

172 phones, 43 crews, test project, `docs/reports/runs/load-before-fixes/`. The game took 6.2 minutes because bots play faster than people.

| Measure | Result |
|---|---|
| Server errors | 0 |
| Typical response | 183 ms |
| Slowest 5 % of responses | over 3.2 s |
| Live connections, peak | 174 |
| Sent over live connections | 631 MB |
| Message limit warnings | 7 |
| Check-in lock queue | seen |
| Deadlock | 1 |

The same warning signs as the event appeared, but not the full collapse. The event collapsed about 15 minutes into play and this run was over in about 6. A run at human pace (`--pace 3.5`) did not produce a result: the first attempt stopped on a generator bug and the second sat in setup for 35 minutes, so it was stopped. Why the collapse came at that exact minute on 30 Oct is still not proven.
