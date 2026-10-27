# Bot run 2026-10-27-0720

Test project only. 3 of 4 steps passed.

| Step | Result | Time | Notes | Log |
|---|---|---|---|---|
| integration | ✅ pass | 197s | Tests  153 passed (153) | [integration.log](integration.log) |
| attacks | ✅ pass | 201s | 172 passed in 200.39s (0:03:20) | [attacks.log](attacks.log) |
| load | ❌ FAIL | 327s | 120/120 joined in 22.1s (0 refused at first); hunt 4.8 min; RPC p95 3468 ms, 5xx 2; bot problems 3; rule findings 0 | [load.log](load.log) |
| scans | ✅ pass | 10s | npm audit (runtime deps): {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0}; pip-audit: no known vulnerabilities; bundle secret scan: clean; supabase db lint (test project): no errors (warnings in supabase-lint.log) | [scans.log](scans.log) |

Findings are written up, fixed and retested in [docs/reports/flaws.md](../../flaws.md).
