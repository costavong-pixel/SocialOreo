# SocialOlla Milestone 2 — Reconciled Gap Ledger

**Status:** Baseline for M2 implementation (issue #6)
**Created:** 2026-08-04
**Baselines:** SocialOreo main `ec9ac0e…` (M1 merged); Content Factory main `05626ae…` (M1 merged)
**Source:** double inspections (SocialOreo A/B, CF A/B, Product Journey, Revenue/Entitlements) + Coordinator A/B confirmation

## 1. Reconciliation of inspector findings

All six inspectors independently concluded the M1 baseline is a sound, well-tested foundation but that the M2 revenue surface is **library-only and unwired**. Two independent BLOCKERs were identified on the revenue path.

### BLOCKER-1 — Dual credit authority (no reconciliation)
- Legacy `CreditAccount`/`CreditLedger` (userId-keyed, live: Square settlement `checkout-service.ts:259-277`, audit consume `consume-credit.ts`) coexists with canonical `CreditBatch`/`CreditTransaction` (workspaceId-keyed, Post-only: `batch-service.ts`).
- `CreditBatchKind.PURCHASED` is never created; no expiry enforcement; monthly batch never resets; no ordering.
- Risk: one Square payment granting credits in both systems (double-grant), and two invisible customer pools.
- **Decision:** canonical `CreditBatch`/`CreditTransaction` becomes the SOLE credit grant/consume authority in M2. Legacy `CreditAccount`/`CreditLedger` stops being written for new purchases and audits; existing rows are preserved read-only during dual run. A reconciliation mapping via `squarePaymentId` is documented. `AuditEvent` records every grant/hold/finalize/refund/adjust.

### BLOCKER-2 — Credit hold/refund key divergence + stranded holds
- `post-service.execute` default intent `post:{dst}:{language}` vs `releasePostHold` default intent `post:{dst}` produce different keys, so `refundCredits` can create a REFUND with no matching HOLD (credit inflation), while the real hold stays stranded.
- `execute` has no failure-path auto-refund around `cf.createRequest`.
- **Decision:** unify the intent-key derivation in one helper used by both paths; add failure-path refund (hold → attempt → on failure refund) while keeping idempotency; add batch-service tests.

### BLOCKER-3 (safety) — Dormant-but-armed Watch worker
- `processDuePublicProfileSnapshots` calls live `fetchSocialAudit` (Apify) with no credit gate; only tests invoke it today, but any future cron would fire live paid calls.
- **Decision:** Watch in M2 is credit-gated and runs only a provider-disabled fixture/stub; the live worker remains unwired (no scheduler). A runtime guard refuses to schedule/capture unless provider-disabled mode.

### CF contract defects (must fix on the CF M2 branch)
- A: response shape inconsistency (`candidates_json` list on create vs string on GET/retry).
- B: query-string params not bound into HMAC signature.
- C: `_staged_candidates` capped at 10 regardless of `requested_count`.
- Plus: `/internal/v1/health` unauthenticated write-side-effect; internal API public exposure on same port (deploy-time concern, not M2 staging); live-feeds dual-run regression (deploy-time concern, flagged for owner).

## 2. Slice-by-slice M2 gap ledger

| Slice | Required (issue #6) | Baseline state | M2 work |
|---|---|---|---|
| A Product shell | SocialOlla branding/tokens, mobile-first shell, Home/Post/Watch/Calendar/Connections/Credits/Assistant/Settings nav, plain-language states, language selector | SocialOreo-only branding; dashboard-only nav; i18n keys unused | Product shell + nav + tokens + states + language selector + no prototype/admin exposure |
| B Workspace & onboarding | race-safe personal workspace, no cross-user access, conversational purpose intake, approved profile, accept/edit/reject/skip, no invented claims, sandbox Instagram/TikTok destinations, first post + 7-day plan, no auto credit spend | workspace.ts lib-only; onboarding lib-only; Destination/Profile unwired | Wire workspace creation; onboarding API/UI; destination CRUD (sandbox); persist profile + 7-day plan |
| C Post beta | topic/offer/product/link; profile+destination selection; provider-disabled title/caption drafts; platform variants; edit; optional first comment; scheduled repost; timezone preview; approve + provider-disabled schedule; per-destination status/evidence | CF internal API create/review/cancel; post-service lib-only; no schedule | Wire post create/review/cancel to CF via client; variants + char limits; schedule/repost models (provider-disabled); evidence mapping |
| D Watch beta | enter/select profile, exact credit cost, confirm, hold, provider-disabled fixture, finalize success, refund failure, persist report/evidence, save profile; report structure | pre-M1 Watch live-capable but worker unwired; M1 resolver lib-only | Credit-gated Watch; provider-disabled fixture; report persistence; keep worker unwired |
| E Revenue/entitlements/credits | admin-configurable $79 lifetime sandbox plan; versioned entitlement + grandfathering; one pricing source; Square sandbox only; exactly-once grant; monthly batch; purchased packs 12-month expiry; monthly-first/earliest-expiring; hold/finalize/refund; exact cost confirmation; customer ledger/expiry; admin adjust/refund with audit | Square sandbox plumbing solid; no $79; no PlanVersion/EntitlementSnapshot writes; dual ledger | Sole canonical credit authority; $79 plan config; settlement → PlanVersion/EntitlementSnapshot + PURCHASED batch + monthly batch; expiry + ordering; ledger UI; admin adjust/refund + AuditEvent |
| F Public funnel | public landing; accurate Post/Watch copy; price from canonical config; one free title/caption demo; temporary session result; signup CTA; consent before guest-context transfer; public assistant; guests cannot publish/schedule/private/credits; email only for ticket/saved progress/signup | landing is Watch-era; pricing hardcoded $89/$19; no demo | Post-first landing; demo route (provider-disabled, labelled, one-per-visitor, consent transfer); pricing from canonical config |
| G Assistant UI | floating assistant; Explain/Draft/ProposeAction/Execute; protected preview + confirmation; M2 Execute limited to approved profile changes, Post create/review/cancel, Watch after credit confirmation, sandbox checkout guidance, support ticket | assistant lib-only | Assistant API/UI + session modes + transcript safety + Execute confirmation |
| H Admin control plane | plans/currencies/prices/availability/effective dates; feature flags; channel states; fair-use; monthly credits/prices/packs; entitlement inspection/override; manual adjust/refund; provider-disable switches; Post/Watch errors/audit; config version history; preview/impact/confirm/rollback | admin only angle-library/contact/feedback | Plan/credit/feature config admin + audit log viewer + manual adjust/refund |

## 3. Authority map (unchanged from M1, now wired)

- SocialOreo/PostgreSQL canonical: identity, workspace, destinations, profiles, plans, entitlements, credits, audit, Watch.
- Content Factory: Post engine behind `/internal/v1` (provider-disabled).
- No second identity/entitlement/credit authority. No live provider, OAuth, payment, publish, or production mutation.

## 4. Provider-disabled + no-bait-and-switch guarantees

- All M2 flows run provider-disabled fixtures/stubs; a runtime guard refuses live provider calls.
- The one free demo must be live-quality, labelled, editable/copyable, one-per-visitor, no fake-failure to force signup, and consent-based before guest-context transfer.
- Pricing page must come from the canonical plan config (no $89/$19 hardcode vs $79).
