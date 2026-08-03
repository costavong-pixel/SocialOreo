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

- Base path `/internal/v1` — NOT publicly exposed.
- Auth: server-to-server request identity (shared secret/API key in Authorization header; HMAC-signed body where feasible). No customer session mapping to admin HTTPBasic.
- Requests are idempotent: required `X-Idempotency-Key` header; Content Factory returns the prior result for a repeated key.
- Endpoints (Milestone 1, provider-disabled defaults):
  - `POST /internal/v1/requests` — create a Post request (campaign context, brief, destination reference, locale, language, requested count).
  - `GET /internal/v1/requests/{id}` — status, evidence, media references, candidate summaries.
  - `POST /internal/v1/requests/{id}/review` — review/edit decisions (approve candidate, request changes).
  - `POST /internal/v1/requests/{id}/cancel` — cancel remaining work (idempotent).
  - `GET /internal/v1/health` — service health + contract version.
- Contract guarantees: fail closed; no raw secrets; no customer identity duplication; no direct customer credit authority; sanitized errors; safe timeouts/retries; provider-disabled defaults return deterministic staged results.
- Platform contracts: platform name, account label, media references, character-limit checks on final variants.

## 4. Watch API contract (SocialOreo, configurable, Milestone 1)

- Preserves PR #4 protections: ownership, explicit opt-in, cancellation, retries, evidence, idempotency, provider-cost estimates, hard safety boundaries.
- Caps/entitlements become configurable from versioned entitlement snapshots (defaults preserved: max 3, plan limits unchanged).
- No real worker or provider enabled.

## 5. Service authentication

- SocialOreo → Content Factory: long-lived server-to-server credential, scoped to internal API only; Content Factory rejects any request that lacks valid request identity.
- No customer credentials flow cross-service.
- No production OAuth used in Milestone 1.

## 6. Data migration and dual run

- No data migration in Milestone 1.
- Content Factory remains authoritative for its operational Post data (SQLite) during dual run; SocialOreo/PostgreSQL remains canonical for identity, workspace, destinations, plans, entitlements, credits, audit.
- Content Factory exposes existing data through the internal API; no blind SQLite→Postgres migration.
- Old services remain reversible until staging acceptance and owner approval.

## 7. Observability

- Contract-level structured logs on both sides: request id, idempotency key, status, error class, duration.
- Audit events in SocialOreo; Post request lifecycle events in Content Factory internal log.
- No raw secrets or raw provider payloads in logs.

## 8. Rollback

- All schema additions are additive (new tables/columns), no destructive ops.
- Internal client/adapter is feature-flag-disabled by default; dual run means SocialOreo can stop calling Content Factory without data loss.
- Rollback points: SocialOreo PR #5 head; Content Factory milestone/socialolla-m1-post head.

## 9. Security boundaries

- Internal API never exposed publicly; never proxied from customer routes.
- No second source of truth for identity, entitlements, or credits.
- No hidden chain-of-thought, secret, raw provider payload, or cross-account data in transcripts or support tickets (assistant contract).
- Assistant action classes: Explain, Draft, Propose action, Execute. Protected actions require exact preview and confirmation.
