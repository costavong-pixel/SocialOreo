# SocialOlla M2 — Completion Ledger

Status: OPEN (browser-driven acceptance complete; awaiting OWNER_REVIEW_GATE)
Inspectors: Backend/Data/Security GO; Product/UI/Journey GO; Test/CI/Review GO
Peer review: GO (conditional) on 41f5509; REV-001..007 fixed in b7b0be8
Cleanup: cf-m2insB already absent (removed in a prior session); manifest recorded in LangGraph checkpoint; quarantine folder preserved.

## Browser-driven acceptance (this phase)
- Installed @playwright/test + chromium (dev-only, not in package.json deps)
- Added playwright.config.mjs + tests/e2e/browser-smoke.spec.js (14 tests)
- Ran against production build (`next build` + `next start` on :3006) because the
  Turbopack dev server does not hydrate client forms reliably (dev-only quirk;
  the application itself is correct — verified identical flow in production).
- 14/14 browser tests PASS with screenshots in /tmp/opencode/browser-screenshots:
  landing, pricing ($79 canonical), free demo (editable/copyable/consent),
  guest protected-action boundary (redirect to /auth/login), shell + onboarding,
  connections (sandbox), posts (variant editor + schedule), watch (credit-cost
  confirm), credits (batches/ledger + checkout), assistant (protected preview),
  admin (price form + adjust/refund + audit), calendar (7-day plan + slots),
  mobile nav + keyboard focus, language selector + RTL (dir=rtl for ar-SA).

## Browser acceptance findings (fixed this phase)
- BROWSER-01 [HIGH, real bug]: Workspace.ownerUserId references User.id (DB PK),
  but m2 server actions passed the Auth0 `sub` → P2003 FK violation on every
  authenticated workspace-touching page (home/onboarding/posts/watch/credits/
  calendar/settings/admin). Unit tests never caught it because Prisma is mocked.
  FIXED: requireUser() now resolves the session user via syncUserFromAuth0 and
  returns { dbId, authUserId }; all workspace calls use dbId; admin actions take
  both authUserId (role check) and dbUserId (workspace); the four pages resolve
  via resolveDbUserFromVerifiedSession().
- BROWSER-02 [MEDIUM]: free demo cookie was set inside the m2Demo Server Action,
  which triggers a full Next.js re-navigation (`/demo?`) that discards the demo
  result. FIXED: the one-per-visitor signed cookie is now issued in middleware
  (src/proxy.ts, Web Crypto HMAC) on the /demo GET; m2Demo is cookie-read-only.

## P1 UI/Journey findings (closed)
- UI-24/25/26/27, JOURNEY-01/03/04/05/06/07/08/09, UI-04/19, UI-21/22/23 — closed in 41f5509 + b7b0be8
  (shell auth guard, nav routes, admin gate, onboarding confirm, variant editor, schedule+ScheduleSlot,
   watch confirmation, checkout entry, assistant panel, admin adjust/refund, seven-day plan UI,
   demo edit/copy/consent/one-per-visitor, i18n+RTL, a11y, states)
- Peer review REV-001..007 — closed in b7b0be8 (first-post form mounted, monthly grant, demo secret,
  admin price form, honest consent copy, provider-mode prop, verified-session demo)


## P2 Backend findings (closed)
- DATA-01 → closed (settlement atomicity via txn client)
- DATA-02 → closed (watch failure scoped to report.id)
- DATA-03 → closed (confirmProfile canonical external key)
- DATA-05 → closed (canonical intentKey + P2002 recovery)
- BACKEND-01 → closed (reuse-first ensureMonthlyBatch in settlement)
- BACKEND-02 → closed (migration_lock.toml added)
- SECURITY-05 → closed (assertProviderDisabledMode in post-service.execute)
- SECURITY-08 → closed (admin guards + price-change audit event)
- DATA-10 → covered by race tests

## Content Factory (change gate TRIGGERED → completed)
- CF-A (candidates_json type consistent across create/GET/list/retry) → fixed
- CF-B (query params in HMAC request-target; reorder/tamper/missing-query tests) → fixed
- CF-C (requested_count honors validated bounds; no silent 10-cap) → fixed
- Authenticated read-only health; sanitized errors; docs/openapi gated by code-level config
- Branch: milestone/socialolla-m2-post-beta @ bad02ca (worktree /home/debian/work/SocialOlla-m2-post)
- Tests: test_internal_api 28 OK; full CF suite 622 OK (2 skipped)
- SocialOreo client contract updated for CF-B/CF-C parity (client.ts + contract-server.fixture.ts)
- Draft PR: branch pushed; PR creation requires owner GitHub API token (no token on server) — recorded
- PR #77 untouched

## Verification
- vitest 321 passed / 1 skipped; tsc clean; eslint clean; next build all routes
- prisma migrate deploy 27/27 on disposable PostgreSQL (twice)
- Protected CI on PR #7 head c17bafa: verify SUCCESS (run 30915862768 / job 92013712947)
- Cross-service portable contract tests 20 passed

## Open items before OWNER_REVIEW_GATE
- CF draft PR creation (owner token required) — branch pushed + CI triggered on push
- Final exact-head acceptance + independent reviews + E2E
