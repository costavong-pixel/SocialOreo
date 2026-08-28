# SocialOlla Current Execution Plan

**Status date:** 2026-08-27  
**Repository:** `costavong-pixel/SocialOreo`  
**Purpose:** Current implementation schedule, outstanding-work ledger, and acceptance authority for SocialOlla.  
**Security policy:** Complete functional implementation first; run the final full security/dependency review against the finished exact release before production approval.

## Authority and evidence rules

This document supersedes older merger-era phase tables for day-to-day implementation scheduling. Historical roadmap and decision documents remain useful for provenance, but this file is the current execution ledger.

1. A feature is not complete because a route returns HTTP 200, a button exists, a mock passes, or provider-disabled code is present.
2. Provider-dependent features require a real provider effect and customer-visible result before they can be called customer-ready.
3. Previously passed evidence remains valid unless a later diff touches or depends on the proven behavior. Use change-impact/delta verification instead of restarting the entire acceptance program after every commit.
4. Claims such as PASS, DONE, CUSTOMER_READY, safe-to-skip, or redundant require identified evidence. If evidence is incomplete, mark the item NOT PROVEN.
5. Customer screenshots and owner visual inspection are acceptance evidence. They have caught failures that automated tests previously missed.
6. Production mutations, production schema/data changes, real payments, and provider actions with real-world effects require an explicit production gate. Nothing in this schedule grants that approval.
7. The latest preserved Codex checkpoint is the working project record until newer repository/runtime/provider evidence contradicts it.

### Feature maturity levels

| Level | Meaning |
|---|---|
| 0 | MISSING |
| 1 | UI_ONLY |
| 2 | LOCAL_BACKEND |
| 3 | STAGING_INTEGRATION |
| 4 | REAL_PROVIDER |
| 5 | CUSTOMER_READY |

## Current release identities

At the latest preserved completion checkpoint:

- GitHub `main`: `467b39e6870e60d3a2cb21e208000af782d86231`
- Last committed completion candidate: `3942075b3915159b50c903a0565b1ccc97861ba6`
- Staging runtime: `12fde638c5d4d641390a94e0480ade005f3389f9`
- Recovered Post/Watch branch preserved separately: `1895e2b4a22dbe9a43e3f54a2b2749551c2235b5`
- The completion run subsequently had provider-boundary/workspace/reconciliation edits that were still uncommitted at the last owner pause. No durable SHA may be claimed for those newest edits until they are committed and verified.
- Production effects from the completion run: zero.
- Real payments: zero.

Staging was healthy at `12fde638...`, but it was not running the newest candidate.

## Foundation already substantially implemented

Do not restart these areas from zero. Reverify only when a relevant diff invalidates prior evidence.

- Canonical SocialOlla shell and navigation.
- Canonical `/home` dashboard.
- `/dashboard` compatibility redirect to `/home`.
- Canonical `/posts` with `/post` compatibility redirect.
- Profile/account context.
- Auth0 subject-based identity binding and Auth0-to-User synchronization.
- Normal USER creation and one personal workspace.
- Staging acceptance bootstrap/audit for the explicitly allowlisted staging account.
- ADMIN navigation role gating.
- Production denial boundary for the staging acceptance override.
- Safe service/environment/revision health metadata.
- Provider/runtime fail-closed boundaries.
- Post backend foundations: drafts, media ownership, platform variants, destinations, credit lifecycle hooks, jobs, retry/cancel/reschedule contracts, guarded Instagram provider code.
- Watch backend foundations: immediate flow, scheduling code, ownership, leases/idempotency, credit hold/finalize/refund, retries, snapshots/evidence/delta code, provider-result sanitization.
- Content Factory service installed/running on staging.
- Backup timer installed/enabled.
- Square checkout/webhook implementation and test foundations.
- Targeted Post/provider/Watch/auth mutation contracts. These are engineering evidence, not provider/customer acceptance.

## Identity visibility requirement

Every authenticated acceptance surface must make the active identity explicit. The account menu and Profile page must show the signed-in email, canonical database role (`User` or `Admin`), and explicit Auth0 provider `email_verified` state (`Yes` or `No`). The admin-only `/admin/sessions` security-playbook view must correlate session events to the canonical account and show the same identity facts without rendering raw Auth0 subjects, tokens, cookies, or raw provider session IDs.

## Outstanding work and implementation schedule

### Phase A — Preserve one exact candidate

**Goal:** Eliminate ambiguity between committed source, local edits, GitHub main, and staging.

Outstanding:

- Finish the active provider-boundary/workspace/reconciliation edits.
- Run required local verification for those edits.
- Commit them to one durable candidate SHA.
- Keep generated `.token-saver/`, Graphify, and similar evidence out of product source history unless intentionally tracked.
- Record exact base/head and changed-file scope.

**Exit gate:** one clean, committed, reproducible candidate SHA.

### Phase B — Deploy and accept the exact application shell

Outstanding:

- Deploy the exact preserved candidate to staging.
- Prove `/health` reports that exact SHA.
- Run authenticated normal USER acceptance.
- Run authenticated ADMIN acceptance.
- Verify Profile and Home.
- Verify 10/10 first-click canonical navigation.
- Verify Dashboard, Post, Watch, Calendar, Connections, Credits, Analysis, Assistant, Settings, and Profile do not fall into stale/public/error states.
- Verify the account menu/Profile explicitly show signed-in email, `User`/`Admin`, and `email_verified: Yes/No`.
- Verify `/admin/sessions` shows canonical account email/current role/provider `email_verified` without raw Auth0 subject exposure.
- Capture current screenshots for owner visual acceptance.

Do not ask the owner to repeat Auth0 login unless there is concrete evidence that the existing session is genuinely unavailable.

**Exit gate:** exact-release USER + ADMIN + navigation + owner-visible acceptance.

### Phase C — Finish real Instagram connection and Post

Outstanding connection work:

- Real Meta OAuth/consent.
- Eligible Instagram professional account/destination selection.
- Verify encrypted token persistence.
- Verify refresh/re-auth lifecycle.
- Verify disconnect/reconnect behavior.

Outstanding Post work:

- Real Instagram publish from SocialOlla.
- Persist real provider receipt/status.
- Surface provider result to the customer.
- Verify real failure behavior and reconciliation.
- Verify retry against the real provider.
- Verify scheduled publishing.
- Verify cancel/reschedule semantics against durable jobs.
- Verify Calendar/history reflects actual delivery state.

**Exit gate:** Instagram Post reaches REAL_PROVIDER, then customer-visible success/failure acceptance reaches CUSTOMER_READY.

### Phase D — Install and prove the Post worker

**Current fact:** only `post-worker:once` was proven to exist; no dedicated running Post systemd service/timer was installed at the latest checkpoint.

Outstanding:

- Install a dedicated staging Post worker/service or timer using the approved release identity.
- Prove restart/recovery behavior.
- Prove a scheduled post executes without an interactive owner action.
- Prove idempotency/reconciliation under interruption or retry.

**Exit gate:** scheduled Post executes automatically and produces a durable provider/customer result.

### Phase E — Finish real Watch

Outstanding:

- Enable/configure an approved real Watch provider on staging.
- Execute real capture #1 and persist evidence.
- Execute automatic capture #2 through scheduler/worker.
- Produce and display real delta/history.
- Prove credit hold -> finalize on success.
- Prove failure -> retry/backoff -> refund/final state without double charging.
- Prove crash/lease/idempotency behavior with the running worker.

**Exit gate:** repeated real Watch captures with evidence, delta, and exactly-once credit settlement.

### Phase F — Install and prove the Watch worker

**Current fact:** only `watch-worker:once` was proven to exist; no dedicated running Watch systemd service/timer was installed at the latest checkpoint.

Outstanding:

- Install a dedicated Watch worker/service or timer.
- Verify restart persistence.
- Verify automatic cadence without owner intervention.
- Verify report/history visibility when a capture completes or fails.

**Exit gate:** Watch operates automatically across at least two scheduled captures.

### Phase G — Choose one credit authority

**Confirmed conflict:** newer and legacy credit mutation paths coexist.

Newer SocialOlla path:

- `CreditBatch`
- `CreditTransaction`

Legacy/parallel paths include:

- `CreditAccount`
- `CreditLedger`
- legacy audit consumption
- Square settlement-related paths

Outstanding:

- Perform a read-only writer/reader census.
- Define the only permitted new-write authority.
- Route Post, Watch, Assistant execution, purchases/refunds, and admin adjustments through that authority.
- Turn legacy paths into explicit compatibility/read history where required.
- Rehearse reconciliation on a clone before any production migration.
- Prove no value loss, double credit, or double charge.

**Exit gate:** one new-write credit authority.

### Phase H — Choose one entitlement authority

**Confirmed conflict:** `PlanVersion`/`EntitlementSnapshot` coexist with `User.accessPlan` and legacy limit resolution.

Outstanding:

- Define the canonical runtime entitlement authority.
- Route Square settlement, feature limits, Watch limits, Post limits, and customer plan display through it.
- Make legacy state compatibility/history only where necessary.
- Rehearse reconciliation before any production migration.

**Exit gate:** one runtime entitlement decision for every customer request.

### Phase I — Finish Content Factory integration

Known:

- Service was active on staging.
- It is a content-generation/draft/review dependency, not the social publishing provider.

Outstanding:

- Prove authenticated service-to-service health using the configured service identity.
- Prove Content Factory's required data/DB path is reachable.
- Prove Post UI -> Content Factory -> usable customer draft on the exact staging release.
- Remove remaining internal `socialoreo` service identity where the canonical identity should be SocialOlla.
- Preserve fail-closed behavior.

**Exit gate:** real customer draft flow with authenticated backend evidence.

### Phase J — Finish Square/payment lifecycle

Known:

- Sandbox checkout/webhook code and tests exist.
- Real payments remain zero.

Outstanding:

- Staging sandbox checkout acceptance.
- Actual webhook delivery acceptance.
- Correct subscription/plan/entitlement update through the canonical entitlement authority.
- Correct credit effect through the canonical credit authority.
- Refund lifecycle acceptance.
- Idempotency/replay acceptance.
- Customer-visible billing/history state.

**Exit gate:** complete sandbox lifecycle. Any real production payment test requires a separate explicit owner gate.

### Phase K — Remaining connected social providers

| Platform | Current state | Outstanding |
|---|---|---|
| Instagram | Partial | real OAuth, token lifecycle, publish and Watch acceptance |
| Facebook Pages | Not implemented | OAuth/assets/tokens/publishing/acceptance |
| TikTok | Public/read/audit path only | connected OAuth/token path and publishing; Watch where provider/API supports it |
| Pinterest | Not implemented | OAuth/board selection/publishing/acceptance |
| LinkedIn | Not implemented | OAuth/profile or organization permissions/publishing/acceptance |
| X/Twitter | Not implemented | OAuth/API access/publishing/acceptance |
| YouTube | Trend/audit references only | connected channel OAuth and publishing workflow |
| Threads | Not implemented | Meta Threads auth/publishing/acceptance |

Implement each through shared destination/job/receipt contracts. Do not label SocialOlla "all-platform" until every advertised provider has real-provider acceptance evidence.

### Phase L — Neutralize conflicting legacy execution

Compatibility/history are not automatically bugs. Remove competing behavior, not historical evidence.

Outstanding:

- Remove/disable duplicate legacy credit writers after canonicalization.
- Remove/disable duplicate entitlement decisions after canonicalization.
- Consolidate legacy audit/Watch execution where it competes with canonical Analysis/Watch.
- Remove obsolete provider execution paths.
- Remove customer-visible SocialOreo/provider-disabled development terminology.
- Replace internal `socialoreo` identity where operationally misleading.
- Keep harmless compatibility redirects if intentional and tested.

**Exit gate:** one execution authority per business concept.

### Phase M — Final exact-release customer acceptance

Run against one finished exact SHA, not every intermediate patch.

Required:

- normal USER
- ADMIN
- Profile
- Dashboard
- Post
- Watch
- Calendar
- Connections
- Credits
- Analysis
- Assistant
- Settings
- payments
- canonical navigation
- account/session identity visibility: signed-in email, `User`/`Admin`, explicit `email_verified`
- screenshots and owner visual inspection
- failure paths and recovery
- real provider effects for provider-dependent features

**Exit gate:** all launch features reach CUSTOMER_READY or are explicitly excluded from launch claims.

### Phase N — Final security and dependency release gate

Per owner direction, the broad security pass is scheduled after functional completion so intermediate candidates are not repeatedly rescanned.

At the final exact release:

- Run full current-head Codex Security review.
- Triage dependency advisories against the final dependency graph.
- Review Auth0/session boundaries and staging override isolation.
- Review workspace/object ownership.
- Review media grants/storage.
- Review OAuth state/token storage/refresh/disconnect.
- Review provider request boundaries/receipt integrity.
- Review worker races, leases, retries, idempotency, reconciliation.
- Review credits, entitlements, Square webhooks, refunds, replay protection.
- Review production/staging isolation and secrets handling.
- Review the user-session security audit log defined in `docs/decisions/SOCIALOLLA_SESSION_SECURITY_LOG.md`.

The previously sealed scan through committed candidate `3942075...` reported zero reportable findings. It does not cover later uncommitted changes or the future finished release and is not the final release verdict.

## Authentication status that must not be misrepresented

The normal staging test user was synchronized successfully to a USER row with exactly one personal workspace and a bootstrap audit event.

The Auth0 provider claim for the tested staging account remained `email_verified=false`. Staging therefore uses the explicit allowlisted staging acceptance override. This does not mean login is generally broken; it means production-equivalent provider verification for that account is not proven by the staging bypass.

Production must continue to deny the staging override.

## User-session security logging workstream

SocialOlla needs a durable, privacy-minimized authentication session audit trail for incident-response/playbook use.

Requirements:

- Persist a durable event when Auth0 establishes/saves an authenticated session at the server callback boundary.
- Reuse the existing `AuditEvent` model instead of creating a second audit datastore unless later requirements prove it insufficient.
- Store Auth0 subject only in existing `actorAuthUserId`; do not duplicate it in JSON payloads.
- Never store access tokens, refresh tokens, ID tokens, cookies, authorization codes, client secrets, raw OAuth state, or raw Auth0 session ids.
- If `sid` or authentication-time information is available, derive only a one-way session reference for deduplication/correlation.
- Store only security-relevant metadata such as identity-provider label, provider `email_verified`, environment, and release identity when available.
- Authentication decisions remain independent of audit persistence; audit-write failure must be observable server-side but must not grant or deny authentication by itself.
- Admin playbook display must resolve canonical account email and current `User`/`Admin` role without copying raw email into the audit payload or rendering the raw Auth0 subject.
- Define retention/export/incident-query policy before production launch; do not invent a retention period in code without an explicit product/security decision.

## Do-not-loop rules for autonomous engineering

- Do not repeat full foundation acceptance because a narrow Watch/provider matcher changed.
- First compute exact diff and dependency/blast radius, then rerun only invalidated evidence.
- Do not repeatedly ask the owner to sign in without evidence the session is missing.
- Do not let provider-disabled mocks satisfy real-provider gates.
- Do not let a worker script satisfy the installed/running worker gate.
- Do not self-approve production gates.
- Do not merge recovered Post/Watch history blindly when current code already implements the same behavior.
- When a long-running job is paused/hard-stopped, do not automatically resume an older completion prompt without explicit owner instruction.

## Definition of done

SocialOlla is not done until the advertised launch surface is customer-ready on one exact release. At minimum this requires an authenticated shell, a real connected provider, real Post delivery, automatic Watch execution, coherent credits/entitlements, accepted sandbox payment lifecycle, customer-visible history/results, final visual acceptance, and the final security/release gate.
