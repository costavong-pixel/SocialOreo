# SocialOlla Content Factory Reuse Strategy

**Decision date:** 2026-08-03  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Core decision

SocialOlla must reuse the existing Barnd AI Content Factory implementation as the primary starting point for **Post**. The working campaign, generation, review, media, destination, delivery-lifecycle, safety, and test foundations must not be discarded or rebuilt from scratch merely to place them under the SocialOlla name.

The post-PR #4 repository audit will decide the final runtime and repository arrangement, but it does not reopen the question of whether proven Content Factory behavior should be preserved. Reuse is the default; replacement requires evidence that a specific module is unsafe, obsolete, incompatible, or more expensive to adapt than to replace.

## Reuse candidates

The audit should prioritize direct reuse or compatibility wrapping of Content Factory capabilities including:

- campaign briefs and guided campaign creation;
- structured candidate generation and resumable generation jobs;
- Creative Matrix planning fields and topic-library uniqueness;
- duplicate, claim, concentration, and review safety gates;
- source-media handling, R2 object references, rendering boundaries, and media evidence;
- review studio, approve/reject/edit workflow, destination previews, and release limits;
- brand/profile and authorized-destination isolation rules;
- platform capability contracts and provider-free adapter interfaces;
- delivery state machine, per-destination jobs, idempotency, retries, timeouts, cancellation, stale recovery, reconciliation, and evidence;
- protected routes, fail-closed workspace scoping, mobile/accessibility behavior, empty/error states, and plain-language lifecycle wording;
- existing automated tests and acceptance contracts.

## Do not confuse foundation completion with live launch completion

Content Factory is advanced, but current repository evidence repeatedly preserves a live-operation boundary. Provider-free interfaces, mocked OAuth, connection readiness, previews, delivery operations, and lifecycle states do not by themselves prove working live Instagram or TikTok publishing.

Before SocialOlla can sell direct publishing, it still needs verified production-quality work for:

- real user authentication and the selected canonical account/workspace model;
- real Instagram and TikTok OAuth, permissions, token storage, refresh, revocation, and identity validation;
- live platform transports and current API capability checks;
- end-to-end publish and schedule evidence for authorized test accounts;
- customer billing, versioned plans, grandfathering, universal credits, and admin controls;
- the unified SocialOlla assistant, notifications, support escalation, and public-session behavior;
- migration from SQLite-backed operational history if PostgreSQL becomes canonical;
- staging, deployment, monitoring, rollback, privacy, and sale-readiness acceptance.

## Integration options to evaluate

The audit must compare these options rather than assuming a rewrite:

### Option A — Content Factory remains the Post service

- Keep the Python/FastAPI Post engine and its tests.
- Expose a versioned internal API to the SocialOlla customer application.
- Use SocialOreo-derived components for Watch, billing, and the customer-facing shell where they are stronger.
- Replace or adapt only identity, entitlement, database, and live-provider boundaries required for a unified product.

This is the preferred speed-to-market candidate because it preserves the greatest amount of working Post code.

### Option B — Selectively port proven modules

- Port only modules that cannot be safely operated as a separate service.
- Preserve behavior through compatibility tests and golden fixtures.
- Do not rewrite a module until its old and new behavior are compared and rollback is defined.

### Option C — Content Factory becomes the main application

- Add SocialOreo Watch, billing, and customer-product capabilities to Content Factory.
- Evaluate only if the post-PR #4 audit shows lower total migration and operating risk than Option A.

## Reuse acceptance rule

For every Content Factory module, the audit must classify it as:

- reuse unchanged;
- reuse behind an adapter;
- migrate with behavior-preserving tests;
- retain temporarily during dual run;
- replace with documented evidence;
- retire as obsolete.

No module may be labelled “rewrite” based only on framework preference.

## First-session onboarding result

After the user approves their profile and connects a supported Instagram or TikTok account, onboarding completes with:

1. one complete destination-specific post ready for review and optional publishing or scheduling;
2. one simple seven-day content plan based on the approved profile and connected-account context;
3. the remaining planned items represented as ideas or lightweight drafts by default rather than automatically spending credits on full AI generations or images;
4. clear costs and confirmation before any additional credit-based generation, image creation, Watch analysis, or delivery action.

The first result should demonstrate real value without wasting credits, creating an overwhelming review queue, or silently publishing content.

## Audit gate

The exact module map and final repository/service arrangement remain gated on:

- SocialOreo PR #4 merging;
- exact merged-main verification and CI;
- feature-by-feature audit of both repositories;
- schema, auth, deployment, and live-provider comparison;
- migration cost, rollback, and dual-run design.

The gate determines **how** Content Factory is reused, not whether its proven Post foundations are thrown away.