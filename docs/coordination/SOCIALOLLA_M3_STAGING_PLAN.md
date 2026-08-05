# SocialOlla M3 — Staging Plan (sanitized for coordination)

Status: DRAFT — approved in the M3 planning loop; awaiting owner gates.
Thread: socialolla-m3-staging-readiness (read-only evidence).
This document is sanitized: it contains environment-variable NAMES only, never
values. No tokens, cookies, private keys, or raw environment files.

## Baselines
- SocialOreo origin/main: 736f7dda608660bc735cb05f490e2e89771fcb81 (M2, PR #7)
- Content Factory origin/main: 61788d02815ce3f8173df456df79025347167698 (M2, PR #79)
- M2 evidence archive SHA-256: eb0c370772893e334822fb192d443d6269982212a5eb2087630f8d251aa734b5
- PR #77 untouched.

## 1. Target Staging Architecture
- SocialOreo M3 Next.js: bind 127.0.0.1:3004, new PM2 app (staging), NODE_ENV=production.
- Content Factory private FastAPI: bind 127.0.0.1:8001, single worker, private (no public vhost).
- Staging PostgreSQL: socialoreo_staging on 127.0.0.1:5432, dedicated role.
- Staging SQLite (CF): posts-staging.db (never the live posts.db).
- Caddy: new vhost m3.socialoreo.com -> 127.0.0.1:3004 (owner-gated).
- Access control: loopback-only binds (no host firewall present; loopback is the control).

## 2. Environment Inventory (names only)
- SocialOreo: NODE_ENV, PORT, HOSTNAME, APP_URL, APP_BASE_URL, DATABASE_URL,
  AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, DEMO_VISITOR_SECRET,
  SQUARE_ENV(=sandbox), SQUARE_APPLICATION_ID, SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID,
  SQUARE_CURRENCY, SQUARE_EXPECTED_MERCHANT_ID, SQUARE_WEBHOOK_SIGNATURE_KEY,
  SQUARE_WEBHOOK_NOTIFICATION_URL, SQUARE_SANDBOX_TESTER_EMAILS,
  SQUARE_CATALOG_VARIATION_LIFETIME, SQUARE_CATALOG_VARIATION_SINGLE_AUDIT,
  SQUARE_CATALOG_VARIATION_CREATOR_PACK, SQUARE_SUBSCRIPTION_PLAN_VARIATION_MONTHLY,
  SQUARE_MONTHLY_PRICE_CENTS(=1900), SOCIALOLLA_MONTHLY_PRICE_CENTS(=1900),
  SOCIALOLLA_PROVIDER_DISABLED, SOCIALOLLA_LIFETIME_PRICE_CENTS,
  SOCIALOLLA_LEGACY_CREDITS, SOCIALOLLA_WATCH_CONFIG_ENABLED,
  CONTENT_FACTORY_ENABLED, CONTENT_FACTORY_API_URL, CONTENT_FACTORY_API_SECRET.
- MUST NOT be set in staging: APIFY_API_TOKEN, APIFY_*_ACTOR_ID, DEEPSEEK_API_KEY,
  OPENAI_API_KEY, DATA365_API_KEY, YOUTUBE_API_KEY, R2_*, META_INSTAGRAM_*,
  TREND_*_DISCOVERY_ENABLED.
- Content Factory: INTERNAL_API_SECRET (high-entropy), POSTS_DB, PUBLIC_FEED_BASE.
- Permissions: all secret .env files chmod 0600.

## 3. Database and Migrations
- Create socialoreo_staging role + DB on 5432; backup prod DBs first.
- npx prisma migrate deploy (27 migrations) then migrate status; optional seed.
- CF: posts-staging.db via scripts/init_db.py with explicit absolute path + prod
  posts.db sha256 guard.
- Rollback: no Prisma down-migrations; restore pre-migration dump; per-slice table.

## 4. Deployment Order
preflight -> backup -> CF deploy (verified SHA 61788d0) -> internal contract health
-> SocialOreo build (736f7dd) -> migrate -> startup -> smoke -> Playwright -> monitor
-> freeze -> rollback.

## 5. Security
- Internal API not public (loopback + INTERNAL_API_SECRET fail-closed; docs 404 when set).
- No production Square (SQUARE_ENV=sandbox; merchant-context; tester double-gate).
- No live OAuth accounts (dedicated staging Auth0 app).
- No live providers or publishing (provider-disabled fail-closed chokepoint; keys omitted).
- No production DB (socialoreo_staging only).
- Secret redaction (.env 0600; no secrets in systemd; env-audit gate).

## 6. Acceptance
16 items (15 exact routes + shell-on-(app)-routes) + Square settlement round-trip,
CF contract round-trip + direct-HTTP contract tests, restart/idempotency, real Auth0
sign-in. Zero-side-effect proof (no outbound provider calls; logs/evidence bundle).

## 7. Operations
Backups (daily pg_dump + nightly posts.db + retention), pm2 startup systemd,
log rotation + journald cap, health-check job + alert, per-slice rollback rehearsal.

## 8. Cost and Effort
~$0 incremental (conditional on no paid providers). Effort: S1-S7, MED ~54 person-hours
(range 31-95).

## 9. Owner Gates
DNS, DB creation, Caddy, PM2, secrets, Auth0 staging app, Square sandbox config,
migrations, service startup, monitoring, any paid service.

## S1 Security Hardening (this thread)
- SECURITY-012/009: relocate production CF admin credential from systemd drop-in to a
  protected 0600 env file and rotate.
- SECURITY-011: enforce 0600 + correct ownership on secret env files.
- SECURITY-017: inspect port 3003 service; document owner decision (no termination in this slice).
- SECURITY-016: fail-closed CF production security update with rollback proof.
- Environment-audit gate.
No staging provisioning (S2-S7) in this slice.
