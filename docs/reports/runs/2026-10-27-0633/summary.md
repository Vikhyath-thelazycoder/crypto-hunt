# Bot run 2026-10-27-0633

Test project only. 7 of 12 steps passed.

| Step | Result | Time | Notes | Log |
|---|---|---|---|---|
| lint | ❌ FAIL | 3s |  | [lint.log](lint.log) |
| typecheck | ✅ pass | 3s |  | [typecheck.log](typecheck.log) |
| build | ✅ pass | 16s | First Load JS shared by all             103 kB | [build.log](build.log) |
| unit | ✅ pass | 3s | Tests  230 passed (230) | [unit.log](unit.log) |
| integration | ✅ pass | 188s | Tests  153 passed (153) | [integration.log](integration.log) |
| e2e-player | ✅ pass | 58s | E2E PASSED | [e2e-player.log](e2e-player.log) |
| e2e-admin | ✅ pass | 70s | ADMIN E2E PASSED | [e2e-admin.log](e2e-admin.log) |
| rule-checker-tests | ✅ pass | 0s | 19 passed in 0.03s | [rule-checker-tests.log](rule-checker-tests.log) |
| simulation | ❌ FAIL | 336s | 100/100 joined in 25.5s (9 refused at first); hunt 4.9 min; RPC p95 1914 ms, 5xx 0; bot problems 1; rule findings 0 | [simulation.log](simulation.log) |
| attacks | ❌ FAIL | 180s | 1 failed, 167 passed in 179.44s (0:02:59) | [attacks.log](attacks.log) |
| load | ❌ FAIL | 327s | 120/120 joined in 15.9s (0 refused at first); hunt 4.9 min; RPC p95 3089 ms, 5xx 0; bot problems 1; rule findings 0 | [load.log](load.log) |
| scans | ❌ FAIL | 23s | npm audit (runtime deps): {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0}; pip-audit: see pip-audit.log; bundle secret scan: LEAK in .next/static/chunks/436-b47d7aaf3db193e3.js, .next/static/chunks/661-6b38a27ccabbe1c8.js, .next/static/chunks/803-79ff1d4449af4814.js, .next/static/chunks/app/admin/(guarded)/print/page-4d439d4d1a419054.js; supabase db lint (test project): see supabase-lint.log | [scans.log](scans.log) |

Findings are written up, fixed and retested in [docs/reports/flaws.md](../../flaws.md).
