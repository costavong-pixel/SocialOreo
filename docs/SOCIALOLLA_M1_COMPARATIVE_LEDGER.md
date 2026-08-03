# SocialOlla Milestone 1 — Comparative Reuse Ledger

**Status:** Approved baseline for Milestone 1 implementation
**Created:** 2026-08-03
**Sources:** exact post-PR #4 SocialOreo audit (c76dafb), Content Factory main audit (e486c7b), Content Factory PR #77 audit (c3c6866)
**Method:** independent subagent audits; every classification carries file:line evidence

## 1. Exact repository comparison

| Dimension | SocialOreo | Content Factory |
|---|---|---|
| Head audited | c76dafb (= origin/main 444e0b2 + docs) | main e486c7b; PR #77 head c3c6866 |
| Stack | Next.js 16.2.12 / App Router / TS / Prisma 6 / Auth0 | Python / FastAPI / SQLite / boto3 / OpenAI |
| Customer identity | Auth0 `User` (authUserId unique), userId-scoped ownership | none (single-operator HTTPBasic admin; brand registry only) |
| Workspace | none (all ownership userId-scoped) | brand workspaces, brand_id scoping enforced |
| Billing | Square sandbox-only, context guard, webhook claim/lease, credit ledger | none |
| Watch | idempotent captures, cap 3, opt-in, cancellation, evidence | n/a |
| Post engine | n/a | campaign/creative-matrix, resumable generation jobs, review studio, delivery evidence |
| Tests | vitest 201/202, typecheck, lint, build PASS | unittest 566 OK; pytest 586 pass on main; PR #77 head red (27 failures) |
| CI | GitHub Actions (Postgres 16) | GitHub Actions (unittest; Playwright in runner) |

## 2. Feature-by-feature reuse ledger

| Feature / module | Owner repo | Classification | Evidence note |
|---|---|---|---|
| Customer identity (Auth0) | SocialOreo | reuse unchanged | src/lib/auth/*, proxy.ts |
| One personal workspace | SocialOreo | reuse after configuration | add Workspace wrapper, fail-closed |
| Multiple labelled connected accounts | SocialOreo | reuse behind an adapter | InstagramInsightsConnection → canonical destination model |
| Destination identity | SocialOreo | reuse behind an adapter | needs canonical destination + platform-scoped identity |
| Profile identity | SocialOreo | reuse after configuration | profileUrl already on AuditJob/PublicProfileMonitor |
| Versioned plans + entitlement snapshots | SocialOreo | reuse behind an adapter | hard-coded caps/plan map must become configurable snapshots |
| Monthly credit batches | SocialOreo | reuse behind an adapter | CreditAccount/Ledger → batched ledger |
| Purchased credit batches | SocialOreo | reuse behind an adapter | ledger rows keyed by squarePaymentId |
| Hold/finalize/refund transactions | SocialOreo | reuse behind an adapter | consume-credit/refund exist; needs batch hold/finalize |
| Audit events | SocialOreo | reuse after configuration | add append-only audit event authority |
| Locale/language fields | both | replace (evidence) | no i18n either repo; build multilingual foundation |
| Service-to-service request identity | new | reuse behind an adapter | new internal auth boundary |
| Idempotency keys | SocialOreo | reuse after configuration | captureKey pattern; generalize |
| Post: campaign context | Content Factory | reuse behind an adapter | content_ai/repository.py + schemas.py |
| Post: campaign brief | Content Factory | reuse after configuration | CampaignBrief schema |
| Post: candidate generation | Content Factory | reuse after configuration | service.py resumable jobs |
| Post: review and editing | Content Factory | reuse unchanged | review studio, human-review-first |
| Post: duplicate and claim safety | Content Factory | reuse unchanged | claim_safety_status enforced |
| Post: media references | Content Factory | reuse unchanged | R2 uploader, media.slabpizza.ca |
| Post: preview | Content Factory | reuse unchanged | platform_previews.py |
| Post: scheduling/delivery prep | Content Factory | reuse behind an adapter | delivery_adapters.py / h5 delivery |
| Post: evidence and status | Content Factory | reuse behind an adapter | delivery_evidence / h5_delivery_evidence |
| Watch: ownership/opt-in/cancel/retry/evidence | SocialOreo | reuse unchanged | watch-policy.ts, PR #4 protections |
| Watch: provider-cost estimates | SocialOreo | reuse after configuration | providerCostEstimate column exists |
| Watch: scheduler/worker | SocialOreo | migrate with behavior-preserving tests | logic solid; durable scheduler unwired |
| Onboarding/assistant | new | build (provider-disabled) | Slice E + Slice G |
| Multilingual | new | build | Slice F |
| Legacy Asset Multiplier + legacy H3 auto-run | Content Factory | retire | flag-off, superseded |
| scripts/ CLI SQLite tools | Content Factory | retire | bypass app guards |

## 3. Canonical module ownership

| Authority | Canonical owner | Notes |
|---|---|---|
| Customer identity | SocialOreo (PostgreSQL) | Auth0 user, one personal workspace |
| Personal workspace | SocialOreo | add wrapper; agency deferred |
| Destinations / connected accounts | SocialOreo | canonical destination + platform-scoped identity |
| Plans / entitlements | SocialOreo | versioned snapshots, admin-configurable |
| Credits | SocialOreo | batched ledger, holds, refunds |
| Audit events | SocialOreo | append-only |
| Post service | Content Factory | versioned internal API, no second identity/ledger |
| Watch service | SocialOreo | capture + entitlements + evidence |

## 4. Service boundaries and cross-service contracts

- SocialOreo = customer shell: identity, workspace, destinations, plans, entitlements, credits, audit, Watch.
- Content Factory = Post service: campaign context, brief, generation, review, media, delivery prep, evidence.
- Cross-service: server-to-server auth + stable external IDs; idempotency keys; fail closed; sanitized errors; safe timeouts/retries.
- Content Factory exposes versioned internal API; SocialOreo holds a thin internal client/adapter.
- No second customer identity or credit ledger in Content Factory.
- Existing Content Factory operational data remains available during dual run; SQLite→Postgres not performed blindly.

## 5. Data migration and dual run

- Migration is NOT performed in Milestone 1.
- Dual run: Content Factory stays authoritative for Post operational data; SocialOreo stays authoritative for identity/billing/Watch.
- Old services remain reversible until staging acceptance and owner approval.
- New canonical schema additions are additive (new tables/columns) with no destructive ops.

## 6. Security boundaries

- Cross-service calls: signed/authorized internal identity; no raw secrets in payloads; no public exposure of internal APIs.
- Content Factory admin (HTTPBasic single-operator) is NOT reused for customer access.
- Watch protections preserved: ownership, opt-in, cancellation, retries, evidence, idempotency, provider-cost estimates, hard caps.
- No live worker or provider enabled during Milestone 1.

## 7. PR disposition

- SocialOreo: single Milestone 1 PR = PR #5 (synced with origin/main, head c76dafb).
- Content Factory: PR #77 left unchanged (audit = SELECTIVE_PORT, suite red on head). New branch `milestone/socialolla-m1-post` created from exact main e486c7b; protective hardening ported with TestClient fixes.
