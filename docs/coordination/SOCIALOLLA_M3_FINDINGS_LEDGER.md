# SocialOlla M3 — Findings Ledger (sanitized)

Status: reconciled from the M3 planning loop; all critical/high findings are
dispositioned in-plan with owner-gated mutation actions. No secrets.

## Critical (resolved-in-plan; owner-gated mutations)
- SECURITY-012/009: production CF admin credential plaintext in world-readable
  systemd drop-in -> relocate to 0600 env file + rotate (S1).
- SECURITY-017: :3003 service runs M1-era code -> document owner decision (S1).
- CF-SECURITY-01/02/03 (from CF inspection): internal API secret unset, caller
  identity, M2 query-signing -> set INTERNAL_API_SECRET + verify parity at deploy.
- DB-001: M2 .env points at stopped 5433 -> staging env must target socialoreo_staging.

## High
- SECURITY-011: secret .env files must be 0600.
- SECURITY-016: CF docs/OpenAPI publicly exposed -> fail-closed gate when secret set.
- DB-002/OPS-001: no automated PostgreSQL backups.
- OPS-002: PM2 does not survive reboot.
- OPS-004/OPS-005: no dependency-aware health / no monitoring-alerting.
- INFRA-001: growthlab.barndai.com dead 3100 route.
- INFRA-002: production socialolla.com terminates on the :3003 staging backend.
- COST-002: cost-leak guardrail (paid provider keys must not enter staging).
- REDTEAM-001/002/007/009/014/019 resolved in plan (loopback binding, DATABASE_URL
  gate, SECURITY-016 fail-closed, prod secret removal, settlement round-trip, CF
  contract boundary).

## Medium
ARCH-001..004, SECURITY-001/013/018, INFRA-003..005, DB-004..007, PRODUCT-001..006/008,
OPS-003/006/007/008, CF-ARCH-01..05, CF-SECURITY-04/05/06 — carried into plan slices
and acceptance criteria.

## CF-Audit (FORENSIC-001) final classification
The 289 staged deletions in /tmp/opencode/cf-audit are a never-committed wholesale
`git rm -r` + `git add -A`: index holds only deletion markers (no unique content);
all files recoverable from HEAD (e486c7b) and origin/main (61788d0). No unpushed
commits. Classification: SAFE_TO_REMOVE (staged-deletion state); the unstage action
is a mutation -> OWNER_REVIEW_REQUIRED. No change made; audit patch preserved.

## Verdicts
- Coordinator B: GO_WITH_CONDITIONS (all conditions resolved in plan).
- Red Team: BLOCK initial (19 findings) -> all fixed -> GO.
- Status: READY FOR M3 OWNER REVIEW (planning). S1 implementation in progress.
