# Bot run 2026-10-27-0656

Test project only. 9 of 12 steps passed.

| Step | Result | Time | Notes | Log |
|---|---|---|---|---|
| lint | ✅ pass | 2s |  | [lint.log](lint.log) |
| typecheck | ✅ pass | 3s |  | [typecheck.log](typecheck.log) |
| build | ✅ pass | 10s | First Load JS shared by all             103 kB | [build.log](build.log) |
| unit | ✅ pass | 3s | Tests  230 passed (230) | [unit.log](unit.log) |
| integration | ✅ pass | 224s | Tests  153 passed (153) | [integration.log](integration.log) |
| e2e-player | ✅ pass | 58s | E2E PASSED | [e2e-player.log](e2e-player.log) |
| e2e-admin | ✅ pass | 68s | ADMIN E2E PASSED | [e2e-admin.log](e2e-admin.log) |
| rule-checker-tests | ✅ pass | 0s | 19 passed in 0.03s | [rule-checker-tests.log](rule-checker-tests.log) |
| simulation | ❌ FAIL | 331s | 100/100 joined in 24.7s (0 refused at first); hunt 4.8 min; RPC p95 1468 ms, 5xx 0; bot problems 1; rule findings 0 | [simulation.log](simulation.log) |
| attacks | ✅ pass | 181s | 168 passed in 180.41s (0:03:00) | [attacks.log](attacks.log) |
| load | ❌ FAIL | 420s | 120/120 joined in 17.7s (0 refused at first); hunt 6.5 min; RPC p95 2843 ms, 5xx 9; bot problems 9; rule findings 0 | [load.log](load.log) |
| scans | ❌ FAIL | 22s | npm audit (runtime deps): {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0}; pip-audit: no known vulnerabilities; bundle secret scan: clean; supabase db lint (test project): ERRORS: relation \ | [scans.log](scans.log) |

Findings are written up, fixed and retested in [docs/reports/flaws.md](../../flaws.md).
