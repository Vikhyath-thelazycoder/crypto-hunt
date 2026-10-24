# Phase 1 · Foundations — report

Date: 2026-10-24 · Status: **COMPLETED** · Plan: [IMPLEMENTATION_PLAN.md › P1](../IMPLEMENTATION_PLAN.md#p1--foundations)

## Tasks

| ID | Task | Result |
|---|---|---|
| T-101 | Next.js 15 + TS strict + Tailwind v4 + ESLint/Prettier + Vitest | Next 15.5.28, React 19.1.0 (pinned, same as AI Musical Chair). `strict` + `noUncheckedIndexedAccess`. `npm run build / lint / typecheck / test` all pass. |
| T-102 | Design tokens, fonts, base UI | Tokens from DESIGN.md in `src/app/globals.css` (`@theme`); component looks copied from the approved mockups (`ch-paper`, `ch-panel`, `ch-wax`, `ch-ghost`, `ch-brass`, `ch-kbox`, `ch-seal`). Fonts IM Fell English SC, Spectral, IBM Plex Mono self-hosted by `next/font`. Components: `ParchmentPanel`, `SealButton`, `KeyInput`, `StateWord` in `src/components/ui/`. Every text colour pair checked ≥ 4.5:1 by a test that reads the real stylesheet. |
| T-103 | Supabase clients, middleware session refresh, env validation | `src/lib/supabase/{client,server}.ts` (`@supabase/ssr`, server file is `server-only`). `src/middleware.ts` refreshes the session on every request. `src/lib/env.ts` (zod) fails fast and refuses a secret key (`sb_secret_…` or a legacy `service_role` JWT) in the public slot. |
| T-104 | Security headers + CSP; no-innerHTML lint rule | Per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, connect only to the own Supabase project, `frame-ancestors 'none'`, `object-src 'none'`). HSTS, nosniff, Referrer-Policy, X-Frame-Options DENY, COOP, Permissions-Policy (camera self only). ESLint errors on `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` assignment and `insertAdjacentHTML`. |

## Evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 7 files, 36 tests pass |
| `npm run build` | pass; all routes dynamic (ƒ); middleware 120 kB |
| `npm audit` | 0 vulnerabilities (postcss pinned ≥ 8.5.23 via `overrides`, as in AI Musical Chair) |
| `next start` + curl `/` | All 6 static headers + CSP present; every `<script>` carries that response's nonce; 0 requests to Google Fonts |
| Build with `NEXT_PUBLIC_SUPABASE_URL` blank | HTTP 500 "Crypto Hunt needs setup" naming the variable, no values shown |
| Supabase `auth/v1/health` with the configured keys | prod 200, test 200; test service key present (local only) |

## Found and fixed during the phase

- **Static pages vs. nonce CSP.** The first build prerendered `/` statically; its 11 scripts had no nonce, so browsers would have blocked them all. The root layout now reads request headers (same fix as AI Musical Chair), every page renders per request, and a test guards it.
- testing-library cleanup needs vitest globals; added `vitest.setup.ts`.

## Not in this phase

- No database, RPCs or game screens yet (P2, P3).
- The project is not a git repository yet, and there is no Vercel project link. Both are needed before the first deploy.

## Next

P2 · Game engine & database: schema, RLS, RPCs (including the round lock D-025 and the final seal code D-026), realtime and the pyramid generator, tested against the Supabase test project.
