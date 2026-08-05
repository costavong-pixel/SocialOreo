# SocialOlla M3 — Security Gates (sanitized)

Status: S1 in progress. This document lists the security gates that must pass
before and during M3 staging. Env NAMES only; no values.

## Gate S1-1 — Secret relocation + rotation (SECURITY-012/009)
- Remove the production Content Factory admin credential from the systemd drop-in.
- Relocate into a protected 0600 environment file owned by the service account.
- Rotate the credential; verify success AND failure authentication.
- Verify no plaintext copy outside the protected file; verify logs redact it.
- Acceptance: `systemctl show` and /proc/<pid>/environ expose no credential; unit
  reloads cleanly; admin auth success/failure verified.

## Gate S1-2 — File permissions (SECURITY-011)
- All secret .env files mode 0600, correct owner/group.
- Acceptance: `stat` on each .env path shows 0600 and the intended owner.

## Gate S1-3 — Port 3003 identity + decision (SECURITY-017)
- Identify PID, process, service, cwd, repo, command, dependencies, external route.
- Document the owner decision (restrict / replace / accept residual). No termination
  in this slice without an explicit owner decision.

## Gate S1-4 — Content Factory fail-closed (SECURITY-016)
- Authorized internal requests succeed; missing/wrong credentials fail.
- Docs/OpenAPI remain gated (404 when INTERNAL_API_SECRET set).
- Provider-disabled behavior remains enforced.
- Customer-facing production behavior uninterrupted.
- Acceptance: curl authed 200 / wrong 401 / docs 404; provider-disabled fixture intact;
  prod feed still healthy; rollback procedure proven.

## Gate S1-5 — Environment-audit gate
- Assert: no AI/APIFY/DATA365/META keys present; SQUARE_ENV=sandbox;
  SQUARE_WEBHOOK_NOTIFICATION_URL matches the staging URL; AUTH0_CLIENT_ID equals the
  provisioned staging app id; DATABASE_URL target = socialoreo_staging
  (host 127.0.0.1, port 5432); CONTENT_FACTORY_API_URL = loopback.
- Pre-migration guard: current_database() must be socialoreo_staging.
- Acceptance: the audit fails on any prohibited var and passes on the staging env.

## Cross-cutting
- /saveruflo before every mutation.
- Permission-preserving backup + restore command for every changed file.
- Two independent coordinators; no agent approves its own change.
- Any unexpected production impact triggers immediate rollback.
- No staging provisioning (S2-S7) in the S1 slice.
