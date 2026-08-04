# SocialOlla Milestone 2 — Architecture Plan

**Status:** Proposed; pending Coordinator B architecture check and specialist reviews
**Created:** 2026-08-04
**Baselines:** SocialOreo main `ec9ac0e…`; Content Factory main `05626ae…`
**Basis:** `docs/SOCIALOLLA_M2_GAP_LEDGER.md` + issue #6

## 1. Credit authority unification (Slice E core)

**Single canonical authority = `CreditBatch` + `CreditTransaction` (workspace-scoped).**

- New purchases (Square sandbox settlement) grant a `PURCHASED` `CreditBatch` (12-month `expiresAt`) and/or a `MONTHLY` batch (anniversary reset), bound to the workspace, plus an `AuditEvent` row.
- Legacy `CreditAccount`/`CreditLedger` remains read-only for historical rows (dual run); no new writes for purchases or audit consumption.
- Spending order: monthly-first, then earliest-expiring purchased.
- Consumption (Post, Watch) uses idempotent HOLD → FINALIZE; failures auto-refund (idempotent); explicit release refunds.
- Fix the hold/refund key derivation: a single `intentKey(workspace, destination, intent)` helper used by execute and release paths; `refundCredits` only refunds when a matching HOLD exists.
- `AuditEvent` is the append-only audit authority for grants/adjustments/refunds/holds.

## 2. Watch (Slice D)

- Credit-gated: Watch run requires an exact cost preview + explicit confirmation + HOLD; success FINALIZEs, failure REFUNDs.
- Provider-disabled fixture only: no live Bright Data/social-data calls. `processDuePublicProfileSnapshots` stays unwired; a runtime guard refuses capture unless provider-disabled mode.
- Report structure: identity/bio/image/links, counts, frequency, topics/formats, public engagement estimates, top posts, 3 strengths, 3 improvements, recommended direction.
- Preserve PR #4 protections (ownership, opt-in, cancellation, retries, evidence, idempotency, hard caps).

## 3. Post customer flow (Slice C)

- SocialOreo owns workspace/destination/profile/credit; Content Factory owns Post candidates/review via `/internal/v1`.
- Flow: create from topic/offer/product/link → select profile + destination → provider-disabled title/caption drafts (platform variants) → edit (title/caption/hashtags/CTA) → optional first comment → optional scheduled repost (linked occurrence) → exact timezone preview → approve + provider-disabled schedule → per-destination status/evidence.
- Additive models: `PostRequest`, `PostOccurrence`, `PostVariant`, `ScheduleSlot` (provider-disabled states).
- CF client fixes required before integration: response-shape consistency (A), query-string HMAC binding (B), staged-candidate count honoring requested_count (C).

## 4. Workspace + onboarding (Slice B)

- Wire `getOrCreatePersonalWorkspace` into authenticated entry (lazy, race-safe via unique `ownerUserId`; `$transaction`/retry on unique conflict).
- Server actions for the conversational profile interview (proposed/confirmed/imported flags, accept/edit/reject/skip), sandbox-labelled Instagram/TikTok destinations, first post + 7-day plan persistence. No auto credit spend on onboarding.

## 5. Public funnel (Slice F)

- Post-first landing; pricing from canonical plan config (single source); one free title/caption demo (provider-disabled, live-quality, labelled, one-per-visitor, editable/copyable, consent-based guest→account transfer, no fake-failure).
- Public assistant for pricing/features/workflow/support; guests cannot publish/schedule/access private data/credits. Email requested only for ticket/transcript/saved progress/signup.

## 6. Assistant UI (Slice G)

- Floating assistant on authorized pages; Explain/Draft/ProposeAction/Execute; protected preview shows account/destination/content/schedule/cost/consequences + confirmation token.
- M2 Execute limited to: approved profile changes, provider-disabled Post create/review/cancel, Watch after credit confirmation, sandbox checkout guidance, support ticket creation. Guests cannot execute private actions.
- Transcript safety: sanitizer (secrets, chain-of-thought, raw payloads, cross-user data) already exists; add persistence with consent and no cross-user data.

## 7. Admin control plane (Slice H)

- Versioned plan/price config (draft/preview/impact/confirm/effective-date/rollback); feature flags; channel states; fair-use limits; monthly credits/action prices/packs; entitlement inspection + user override; manual adjustment/refund with reason + audit; provider-disable switches; Post/Watch error + audit-event viewer; config version history. No agency/team admin.

## 8. Product shell (Slice A)

- SocialOlla branding/design tokens; mobile-first shell; nav Home/Post/Watch/Calendar/Connections/Credits/Assistant/Settings; plain-language loading/empty/error/offline/partial states; language selector (wiring i18n); no prototype/admin-route exposure. Keyboard/mobile tested.

## 9. Cross-service, security, and boundaries

- Cross-service contract tests (valid/wrong credential, stale signature, nonce replay, wrong workspace/destination, duplicate, timeout/retry/partial failure/restart, locale preservation, no duplicate credit/delivery, safe shutdown).
- Security: workspace isolation everywhere; no guest execution of protected actions; transcript/ticket sanitization; no raw secrets in payloads/logs; no second identity/entitlement/credit authority; provider-disable runtime guard; Square sandbox-only; internal API never exposed publicly.
- No live OAuth, providers, publishing, real payments, or production data. No merge/deploy in M2.

## 10. Testing strategy

- SocialOreo: prisma generate/validate, disposable PG migrations, workspace race/isolation, onboarding, Post, Watch credit hold/finalize/refund, Square sandbox entitlement, guest boundaries, assistant confirmation, multilingual, admin config, portable CF contract tests, full suite, lint, typecheck, build, diff, secret/dependency checks.
- Content Factory (if changed): internal API auth/HMAC/freshness/replay/idempotency/isolation, request/review/cancel, provider-disabled behavior, full unittest/pytest, compile/static/import/startup/process cleanup, diff/secret scan.
- Mobile/a11y: keyboard, focus, labels, error announcements, breakpoints, RTL, zoom, touch targets, reduced motion (unit-level; no browser tooling installed — recorded limitation).
