# SocialOreo Agent Instructions

This is the permanent repository policy for the SocialOreo/SocialOlla engineering workflow. A current task packet supplies only the changing, bounded feature scope; it does not override these controls.

## Model roles and authority

The latest owner-approved execution hierarchy is:

1. **GPT-5.6 Terra — Project coordinator / supervisor**
   - Owns the whole SocialOlla execution loop, roadmap order, commercial priority, architecture/risk oversight, milestone sequencing, evidence quality, and GO/BLOCK decisions.
   - Terra is the active coordinator for long-running milestone work, including Phase C.
   - Terra decomposes the milestone into bounded implementation, test, staging, provider, and recovery loops; checks progress between loops; prevents premature stops; and selects the next highest-value task.
   - Terra directly inspects repository state, diffs, test evidence, staging evidence, and provider evidence when needed.
   - Terra does not normally write feature code and cannot self-merge, bypass protected branches, or bypass owner gates.

2. **GPT-5.6 Luna — Primary implementation coder / engineering worker**
   - Luna is the primary coding lane for SocialOlla feature implementation, fixes, tests, migrations, scripts, UI, provider integration, staging tooling, and bounded engineering for the active Terra-approved task.
   - Luna works only inside Terra-approved scope and approved `codex/*` worktrees/branches.
   - Luna must investigate and repair ordinary engineering failures rather than returning early for fixable problems.
   - Luna returns exact diffs, tests, runtime evidence, blockers, and side-effect counts to Terra after each loop.
   - Luna cannot redefine milestone scope, self-approve, self-merge, authorize production, or bypass owner gates.

3. **Hermes — Optional long-running helper / durable dispatcher**
   - Hermes may sustain long tests, log inspection, repetitive QA, checkpointed work, and bounded worker dispatch when actually available.
   - Hermes is an accelerator, not a customer-feature requirement.
   - Do not build a new Hermes control framework as part of ordinary SocialOlla feature work.

4. **DeepSeek direct API — optional fallback helper**
   - DeepSeek is not the primary coder while Luna is available.
   - Use it only when Terra determines a bounded fallback/forensic task benefits from it and the current environment has passed a safe DeepSeek smoke.
   - Never print or log its API key and never fabricate model execution evidence.

Requested, routed, actual, and attested model identities must remain distinct in evidence. If Terra or Luna is not actually callable in the execution environment, report the real model/tool used rather than inventing the requested identity.

## Loop engineering operating model

The owner prefers long, low-interruption runs. Each milestone uses a durable loop rather than a one-shot checklist:

`REFRESH_REMOTE -> LOAD_EVIDENCE -> INSPECT -> RECONCILE_GAPS -> PLAN_NEXT_LOOP -> LUNA_IMPLEMENT/INVESTIGATE -> FOCUSED_TEST -> TERRA_REVIEW -> FIX/RETEST -> STAGING/PROVIDER_EVIDENCE -> CHECKPOINT -> NEXT_LOOP`

Rules:

- Terra owns loop state and must not restart already-passed gates without evidence that they became stale.
- Luna owns bounded implementation/investigation inside the current loop.
- Ordinary test failures, lint/type errors, fixable staging problems, recoverable provider errors, and implementation defects do not justify ending the long run. Diagnose, repair, retest, and continue.
- Ask the owner only for a genuine non-resolvable gate: interactive account login/consent, a secret that cannot be safely recovered from approved stores, new live-provider/payment/production authorization, destructive action, or a genuine business/architecture decision.
- Before reporting a missing secret, inspect approved staging configuration sources, systemd EnvironmentFile/drop-ins, deployment config, approved staging backups, and documented secret stores for key PRESENCE without printing secret values. Do not scrape shell history or logs for secret values.
- A recoverable staging configuration problem should be repaired from approved staging evidence after recording backup/rollback, not returned immediately as `BLOCKED`.
- For staging token-encryption material: if the required key is absent and there is no existing ciphertext/token state that must remain decryptable, Luna may generate a new high-entropy staging-only encryption key with a standard cryptographic generator, store it with restrictive permissions, never print it, and record only that generation/storage succeeded. If existing ciphertext depends on an unknown old key, stop rather than rotating blindly.
- Do not burn CI minutes on trivial checkpoint commits. Qualify locally, consolidate, then push an exact candidate.
- At every major loop checkpoint Luna reports exact base/head, files changed, tests, runtime/provider evidence, side-effect counts, rollback, and blockers. Terra then returns `GO`, `REWORK`, or `OWNER_GATE` with the next loop.

## Commercial / release sequencing

The program is optimized for reaching a sellable individual-user product quickly. Do not spend time on deferred agency/team features, Reply Agent work, additional platforms, or broad refactors unless an active sellability blocker requires them.

Use this order unless the owner explicitly changes it:

1. Complete the normal individual-user customer shell and authentication acceptance.
2. Complete provider-disabled Post end to end, including durable jobs/workers and truthful UI.
3. Prove controlled real Instagram connection/publishing on staging when separately owner-authorized.
4. Complete Watch customer flow, automatic worker execution, credit settlement, and truthful history.
5. Reconcile canonical credits and entitlements; prove payment/checkout mechanics in sandbox and the customer-visible purchase/entitlement journey. Payment mechanics may be implemented and tested before final pricing is chosen.
6. Complete remaining launch-critical customer UX, recovery/operations, exact-release staging and final customer acceptance. Freeze substantive feature scope.
7. **SECOND-TO-LAST substantive gate — final security audit.** Run the comprehensive security, isolation, dependency, secret, provider-boundary, payment-boundary, migration/rollback, abuse, idempotency/replay, and exact-release audit against the frozen candidate. Material code changes after this audit invalidate the affected security evidence and require an appropriate re-audit.
8. **LAST product/business adjustment — final pricing/offer decision.** Until then, existing pricing is provisional working configuration. Final pricing changes must be limited to the canonical price/offer configuration and matching customer copy whenever possible; do not redesign auth, payment, entitlement, or security logic during the pricing gate. Run focused pricing/checkout regression after the adjustment. If a pricing change materially alters security-sensitive code, the affected security checks must be rerun before launch.
9. Owner launch gate: exact release identity, rollback, live-provider/payment authorization and launch/no-launch decision.

Do not repeatedly tune price while core functionality is still changing. Do not perform the final security audit against a moving implementation.

## Customer-feature completion

Backend or engine implementation alone is not a finished customer feature. The applicable acceptance contract must pass every relevant gate:

- engine;
- usable customer UI;
- integration;
- persistence/state;
- success flow;
- failure/error flow;
- customer discoverability and usability;
- required tests; and
- required runtime evidence.

An API endpoint, unit test, worker, service, database model, or merged backend PR does not by itself make a customer-facing capability DONE. If an existing engine capability is not exposed through usable UI, the feature is incomplete.

Before adding backend architecture, inspect current `main` and reuse existing Post, Watch, provider, and runtime functionality. Do not unnecessarily rebuild the runtime foundation delivered by PR #23.

## Task contract

Every implementation worker must read this file and the repository-authoritative documents it references before reading a changing task packet. The packet must contain only the bounded task and these fields:

```text
FEATURE_ID
USER_GOAL
CURRENT_EVIDENCE
CURRENT_GAP
SCOPE
OUT_OF_SCOPE
ENGINE_REQUIREMENTS
UI_REQUIREMENTS
INTEGRATION_REQUIREMENTS
ACCEPTANCE_CRITERIA
TEST_REQUIREMENTS
ALLOWED_AREAS
KNOWN_BLOCKERS
```

If the packet conflicts with this policy, the worker must return `BLOCKED` and the exact conflict to Terra. It must not silently choose which instruction to ignore. Task packets must not contain credentials, provider tokens, raw customer data, or secret-like fields.

## Evidence and provider boundaries

- Use `VERIFIED`, `REPORTED`, `INFERENCE`, `BLOCKED`, or `UNKNOWN` truth labels where evidence is not direct. Do not convert provider-disabled behavior into real provider success.
- Staging qualification must record the exact runtime revision, release, health, service, worker result, and relevant side effects.
- Provider-disabled means zero calls to Meta, Instagram, Apify, Square, email, payment, or other external providers; it must never display a delivered, captured, or paid-success result.
- Real provider effects require the current owner-authorized gate and must be bounded to the approved account/environment/call count.
- Preserve ownership isolation, fail-closed behavior, bounded logs, sanitized errors, secret confidentiality, and replay/idempotency protections.

## Work and delivery rules

- Implement only the bounded task packet on a `codex/*` development branch.
- Never push directly to `main`.
- Never force-push, self-approve, self-merge, or enable auto-merge.
- Never change repository settings, security controls, credentials, or CI workflow policy as ordinary feature work.
- Never deploy production without a separate owner gate.
- Staging writes require a pre-change backup/pointer and exact rollback path.
- Create or update a Draft PR and return loop evidence to Terra.
- Terra reviews the whole milestone state and chooses `GO`, `REWORK`, or `OWNER_GATE` for the next loop.
- A passing local test is not runtime or customer evidence.

The dispatcher must fail closed when this file is absent and must complete repository-policy/bootstrap checks before allowing a worker to read or execute a task packet. No worker may bypass the dispatcher or write outside its approved worktree.
