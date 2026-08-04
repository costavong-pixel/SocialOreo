# SocialOlla Milestone 1 — Architecture Proposal

**Status:** Proposed; pending independent architecture, security, and migration reviews
**Created:** 2026-08-03
**Basis:** docs/SOCIALOLLA_M1_COMPARATIVE_LEDGER.md + confirmed product decisions

## 1. Topology

```
SocialOreo (Next.js 16 + PostgreSQL) = customer shell authority
├── Auth0 customer identity
├── one personal workspace (new wrapper, fail-closed)
├── labelled connected accounts / destinations (canonical)
├── versioned plans + entitlement snapshots
├── batched credits (monthly + purchased) with hold/finalize/refund
├── append-only audit events
├── Watch service (capture, entitlements, evidence)
└── internal client/adapter -> Content Factory Post API

Content Factory (FastAPI + SQLite) = Post service
├── versioned internal JSON API (new, thin, over existing core)
├── campaign context, brief, generation, review, media, delivery prep, evidence
└── NO customer identity, NO credit ledger (dual run preserves operational data)
```

## 2. Authority map

| Authority | Owner | Milestone 1 change |
|---|---|---|
| Identity | SocialOreo | none (reuse) |
| Workspace | SocialOreo | add one-personal-workspace wrapper |
| Destinations | SocialOreo | canonical destination + platform-scoped identity fields |
| Profiles | SocialOreo | profile identity fields |
| Plans/entitlements | SocialOreo | versioned snapshot model (provider-disabled) |
| Credits | SocialOreo | batched ledger + hold/finalize/refund (provider-disabled) |
| Audit events | SocialOreo | append-only audit event model |
| Post | Content Factory | versioned internal API |
| Watch | SocialOreo | contract-driven caps/entitlements (no worker enable) |

## 3. Post API contract (Content Factory internal, versioned v1)

- Base path `/internal/v1` — NOT publicly exposed. Served on a separate binding/port or behind an ingress deny rule for `/internal/*`; never mounted inside the admin router; never reuses `require_same_origin` (browser CSRF gate is not applicable to server-to-server).
- Auth: mandatory HMAC-signed requests for all state-changing endpoints — signature over `method + path + body + timestamp + nonce + X-Idempotency-Key`, with a freshness window (≤ 5 minutes skew). Server-to-server shared secret in the `Authorization` header, compared in constant time, cryptographically distinct from the admin `ADMIN_PASSWORD`. No customer session mapping to admin HTTPBasic.
- Credential lifecycle: per-environment keys, secret-manager storage, documented rotation, scoped to `/internal/v1` only. Never committed, never logged, never in error messages or transcripts.
- External identity: one stable external workspace ID per workspace (`wsp_…` prefix, distinct from SocialOreo cuids and CF UUIDs). Cross-service references use only the external ID namespace — never raw internal primary keys.
- Requests are idempotent: required `X-Idempotency-Key` header, namespaced per requester (`so:<workspaceId>:<key>`). Content Factory persists keys in a durable idempotency table (new, additive, unique on `requester + key`) committed atomically with request creation, and returns the prior result for a repeated key.
- `{id}` in GET/review/cancel is the client-supplied external request UUID (SocialOreo-generated), stored and echoed by Content Factory, used for idempotency and audit correlation.
- External status enum (identical in staged and provider modes): `pending | generating | review | approved | scheduled | delivered | cancelled | failed`, with an explicit mapping from internal Content Factory states.
- Endpoints (Milestone 1, provider-disabled defaults):
  - `POST /internal/v1/requests` — create a Post request (campaign context, brief, opaque destination reference, locale, language, requested count).
  - `GET /internal/v1/requests/{id}` — status, evidence, media references, candidate summaries.
  - `GET /internal/v1/requests?destination_ref=&status=&since=` — filtered list with pagination (the customer shell enumeration path; no derived PostgreSQL projection is used).
  - `POST /internal/v1/requests/{id}/review` — review/edit decisions (approve candidate, request changes).
  - `POST /internal/v1/requests/{id}/cancel` — cancel remaining work (idempotent).
  - `GET /internal/v1/health` — service health + contract version + confirms existing operational data is reachable (no shadow database).
- Destination references are opaque, SocialOreo-owned external keys. Content Factory stores them verbatim and must never resolve or validate them against its `brand_id`/`workspace_id` registry; unknown references return a sanitized "invalid destination reference". Every internal handler binds a request to its presented workspace/brand and brand-scopes subsequent GET/review/cancel (mirrors `brand_id != workspace_id` and `authorized_destinations_for_brand`).
- Contract guarantees: fail closed; no raw secrets; no customer identity duplication; no direct customer credit authority; sanitized errors; safe timeouts/retries (numeric, per-request caps, volume guard on the internal API); provider-disabled defaults return deterministic staged results.
- Platform contracts: platform name, account label, media references, character-limit checks on final variants.

## 4. Watch API contract (SocialOreo, configurable, Milestone 1)

- Preserves PR #4 protections: ownership, explicit opt-in, cancellation, retries, evidence, idempotency, provider-cost estimates, hard safety boundaries.
- Caps/entitlements become configurable from versioned entitlement snapshots (defaults preserved: max 3, plan limits unchanged).
- No real worker or provider enabled.

## 5. Service authentication

- SocialOreo → Content Factory: long-lived server-to-server credential per environment, scoped to internal API only; Content Factory rejects any request that lacks valid request identity (HMAC mandatory for state changes).
- No customer credentials flow cross-service.
- No production OAuth used in Milestone 1.

## 6. Data migration and dual run

- No data migration in Milestone 1. The one-personal-workspace wrapper is created lazily on first access (no backfill of existing users; `Workspace` owner relation optional/nullable).
- Content Factory remains authoritative for its operational Post data (SQLite) during dual run; SocialOreo/PostgreSQL remains canonical for identity, workspace, destinations, plans, entitlements, credits, audit.
- Content Factory exposes existing data through the internal API using the same existing SQLite DB path and its additive `migrate()`; no blind SQLite→Postgres migration; no shadow database.
- SQLite hardening for the internal API: WAL mode + `busy_timeout` on internal connections; restart durability documented for background generation (resumable-job state; in-progress reflected in status); single-file backup/restore procedure defined.
- Old services remain reversible until staging acceptance and owner approval.
- Additive-only freeze list: M1 shall not modify existing SocialOreo tables/columns/enums (`User`, `CreditAccount`, `CreditLedger`, `Square*`, `AuditJob`, `PublicProfileMonitor`, `InstagramInsightsConnection`, etc.); canonical additions are new tables only. Same for Content Factory existing tables; new columns nullable or defaulted (SQLite constraint). No new values added to existing enums; new enums only for new tables. "Retire" = flag-off/disable only in M1, never code or table deletion.

## 7. Observability

- Contract-level structured logs on both sides: request id, idempotency key, status, error class, duration. Never log the `Authorization`/API-key header. Idempotency keys are treated as capabilities (they grant access to stored results) and never logged raw in support/transcripts.
- Audit events in SocialOreo (canonical). Post request lifecycle events in Content Factory internal log are derived/operational and never authoritative. Content Factory logs must never contain `authUserId` (opaque request/destination references only).
- No raw secrets or raw provider payloads in logs. Redaction helpers used by the codebases are applied to the internal router.

## 8. Rollback

- All schema additions are additive (new tables/columns only, never touching existing data), no destructive ops at the data/table level.
- Internal client/adapter is feature-flag-disabled by default; dual run means SocialOreo can stop calling Content Factory without data loss.
- SocialOreo rollback reverts PR #5 and touches only new tables/columns; Content Factory rollback redeploys exact main `e486c7b`.
- Rollback points: SocialOreo PR #5 head; Content Factory milestone/socialolla-m1-post head.

## 9. Security boundaries

- Internal API never exposed publicly; never proxied from customer routes; tests assert public/admin surfaces cannot reach internal handlers.
- Assistant `Execute`/protected actions run only in authenticated server-side SocialOreo paths that enforce workspace/destination/credit/entitlement checks; public guests are structurally unable to reach Execute; flows go through the internal client → Content Factory internal API.
- The `scripts/` SQLite CLI tools (bypass app guards) are excluded from milestone deployment.
- The `milestone/socialolla-m1-post` branch (PR #77 hardening ported with TestClient Origin-header fixes) must pass its full suite before merge; the red PR #77 head is not an acceptable baseline.
- Staging acceptance pre-flight includes: Content Factory side-effect flags all false; delivery/scheduling flags false; legacy Asset Multiplier and legacy H3 auto-run flag-off; `scripts/` CLI disabled.
- No second source of truth for identity, entitlements, or credits.
- No hidden chain-of-thought, secret, raw provider payload, or cross-account data in transcripts or support tickets (assistant contract).
- Assistant action classes: Explain, Draft, Propose action, Execute. Protected actions require exact preview and confirmation.

## 10. Independent review record

| Reviewer | Role | Verdict | Conditions incorporated |
|---|---|---|---|
| ses_036898ed9ffeQOGEA7BSb57o21 | Architecture | APPROVE_WITH_CONDITIONS | destination refs opaque/never resolved; enumeration via filtered GET /requests list; external status enum + external request UUID; CF-side idempotency store ownership; SQLite WAL/busy_timeout + durability; ledger wording; CF volume guard + derived log |
| ses_036897f82ffeefp46hOnFzttDy | Security/isolation | APPROVE_WITH_CONDITIONS | mandatory HMAC + freshness; credential issuance/rotation/scope; physical exposure control (separate binding/deny); workspace wrapper 1:1 lazy fail-closed; brand-scoped internal handlers; log/transcript redaction + idempotency-as-capability; assistant Execute wiring; scripts/ CLI disabled; green branch gate |
| ses_036896fecffeb9yq9xHF1iolh2 | Data/migration | APPROVE_WITH_CONDITIONS | external-ID scheme (wsp_…) + namespaced idempotency keys + durable idempotency table; additive-only freeze list + SQLite NOT NULL caveat; lazy workspace creation; reuse existing CF DB + no shadow DB; staging pre-flight checklist; rollback boundary; data/table-level wording |

All three reviewers approved the topology, authority map, dual-run split, and credit-preservation guarantees as structurally sound. Conditions are incorporated in sections 3–9 above.
