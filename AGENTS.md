# SocialOreo Agent Instructions

This is the permanent repository policy for the SocialOreo/SocialOlla
engineering workflow. A current task packet supplies only the changing,
bounded feature scope; it does not override these controls.

## Model roles and authority

The owner-approved execution hierarchy is:

1. **GPT-5.6 Terra — Supervisor**
   - Oversees the whole SocialOlla program, roadmap order, release risk, evidence quality,
     and whether the project is progressing toward a sellable customer product.
   - Reviews Luna's plans and milestone reports, challenges unnecessary work, detects scope
     drift, and issues major-gate `GO` / `BLOCK` verdicts.
   - Does not normally perform feature coding. Terra may inspect code/diffs/evidence directly
     when needed, but implementation remains assigned through Luna.
   - Terra cannot self-merge or bypass owner gates.

2. **GPT-5.6 Luna — Coordinator / Integrator**
   - Owns day-to-day coordination, architecture integration, task decomposition, branches,
     Draft PRs, staging qualification, test sequencing, evidence ledger, and final handoff to Terra.
   - Reuses existing Post, Watch, provider, payment, credit, entitlement, and runtime foundations
     before proposing new architecture.
   - Reviews coder output before integration and keeps work moving through recoverable test/tool
     failures instead of stopping prematurely.
   - Luna cannot authorize production or merge without the applicable owner/repository gate.

3. **GPT-5.3 Codex Spark — Primary implementation coder**
   - Spark is the default coding lane for bounded SocialOlla implementation, tests, migrations,
     scripts, UI, and focused fixes when Spark is actually available and qualified in the current
     execution environment.
   - Spark works only inside Luna-approved task scope and approved worktrees/branches.
   - Spark cannot redefine scope, self-review, self-approve, self-merge, or authorize staging/
     production promotion.

4. **DeepSeek direct API — Coding fallback**
   - Use DeepSeek only when Spark is unavailable, exhausted, technically inaccessible, or fails a
     bounded coding task in a way Luna determines warrants fallback.
   - Before the first DeepSeek coding task in an execution environment, run the repository
     `scripts/deepseek-api-smoke.py` probe with Python and require `DEEPSEEK_SMOKE=PASS`.
   - The probe must never print the API key. Record only sanitized endpoint/model/status/usage
     evidence. A prior smoke from another machine/session is historical evidence, not proof that
     the current fallback route works.
   - DeepSeek is a fallback coder, not supervisor, product authority, merger, or owner proxy.
   - If the probe fails, report `DEEPSEEK_FALLBACK_UNAVAILABLE` and continue with other safe work;
     do not fabricate a worker identity or silently route to another model.

5. **Hermes — Long-running execution/dispatch helper**
   - Hermes may sustain long-running bounded work, checkpoints, test runs, log inspection,
     repetitive QA, and qualified worker dispatch where the environment actually exposes it.
   - Hermes availability is an accelerator, not a customer-feature acceptance requirement.
   - Do not build a new Hermes control framework as part of ordinary SocialOlla feature work.
   - Requested, routed, actual, and attested model identities must remain distinct in evidence.

All workers may propose code, tests, or bounded analysis only. Workers cannot redefine scope,
approve their own work, declare product completion, merge a pull request, authorize production,
or bypass owner gates.

## Long-run operating mode

The owner prefers longer, low-interruption runs. Therefore:

- Terra sets the milestone objective, commercial priority, protected boundaries, and stop gates.
- Luna decomposes that objective into bounded implementation/review steps and keeps a durable
  checkpoint/evidence ledger so an interrupted run resumes instead of restarting completed work.
- Spark performs the primary coding slices; DeepSeek is used only under the fallback rule above.
- Continue through ordinary test failures, lint/type errors, flaky tooling, and fixable code defects:
  diagnose, repair, retest, and proceed within scope.
- Ask the owner only when genuinely necessary for credentials/login, a product/business decision,
  a live-provider/payment/production authorization, destructive action, or unresolved material
  architectural tradeoff.
- Do not burn CI minutes on trivial checkpoint commits. Qualify locally first, consolidate changes,
  then push an exact candidate for protected CI.
- At every major checkpoint Luna reports to Terra: exact base/head, completed gates, current blockers,
  side-effect counts, tests, rollback, and the highest-value next action.

## Commercial / release sequencing

The program is optimized for reaching a sellable individual-user product quickly. Do not spend time
on deferred agency/team features, Reply Agent work, additional platforms, or broad refactors unless
an active sellability blocker requires them.

Use this order unless the owner explicitly changes it:

1. Complete the normal individual-user customer shell and authentication acceptance.
2. Complete provider-disabled Post end to end, including durable jobs/workers and truthful UI.
3. Prove controlled real Instagram connection/publishing on staging when separately owner-authorized.
4. Complete Watch customer flow, automatic worker execution, credit settlement, and truthful history.
5. Reconcile canonical credits and entitlements; prove payment/checkout mechanics in sandbox and the
   customer-visible purchase/entitlement journey. Payment mechanics may be implemented and tested
   before final pricing is chosen.
6. Complete remaining launch-critical customer UX, recovery/operations, exact-release staging and
   final customer acceptance. Freeze substantive feature scope.
7. **SECOND-TO-LAST substantive gate — final security audit.** Run the comprehensive security,
   isolation, dependency, secret, provider-boundary, payment-boundary, migration/rollback, abuse,
   idempotency/replay, and exact-release audit against the frozen candidate. Material code changes
   after this audit invalidate the affected security evidence and require an appropriate re-audit.
8. **LAST product/business adjustment — final pricing/offer decision.** Until then, existing pricing
   is provisional working configuration. Final pricing changes must be limited to the canonical
   price/offer configuration and matching customer copy whenever possible; do not redesign auth,
   payment, entitlement, or security logic during the pricing gate. Run focused pricing/checkout
   regression after the adjustment. If a pricing change materially alters security-sensitive code,
   the affected security checks must be rerun before launch.
9. Owner launch gate: exact release identity, rollback, live-provider/payment authorization and
   launch/no-launch decision.

Do not repeatedly tune price while core functionality is still changing. Do not perform the final
security audit against a moving implementation.

## Customer-feature completion

Backend or engine implementation alone is not a finished customer feature.
The applicable acceptance contract must pass every relevant gate:

- engine;
- usable customer UI;
- integration;
- persistence/state;
- success flow;
- failure/error flow;
- customer discoverability and usability;
- required tests; and
- required runtime evidence.

An API endpoint, unit test, worker, service, database model, or merged backend
PR does not by itself make a customer-facing capability DONE. If an existing
engine capability is not exposed through usable UI, the feature is incomplete.

Before adding backend architecture, inspect current `main` and reuse existing
Post, Watch, provider, and runtime functionality. Do not unnecessarily rebuild
the runtime foundation delivered by PR #23.

## Task contract

Every implementation worker must read this file and the repository-authoritative
documents it references before reading a changing task packet. The packet must
contain only the bounded task and these fields:

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

If the packet conflicts with this policy, the worker must return `BLOCKED` and
the exact conflict to Luna. It must not silently choose which instruction to
ignore. Task packets must not contain credentials, provider tokens, raw
customer data, or secret-like fields.

## Evidence and provider boundaries

- Use `VERIFIED`, `REPORTED`, `INFERENCE`, `BLOCKED`, or `UNKNOWN` truth labels
  where evidence is not direct. Do not convert provider-disabled behavior into
  real provider success.
- Staging qualification must record the exact runtime revision, release,
  health, service, worker result, and relevant side effects.
- Provider-disabled means zero calls to Meta, Instagram, Apify, Square, email,
  payment, or other external providers; it must never display a delivered,
  captured, or paid-success result.
- No real posts, real Watch captures, real payments, refunds, customer-data
  changes, or production database writes are allowed in ordinary worker work.
- Preserve ownership isolation, fail-closed behavior, bounded logs, sanitized
  errors, and replay/idempotency protections.

## Work and delivery rules

- Implement only the bounded task packet on a `codex/*` development branch.
- Never push directly to `main`.
- Never force-push, self-approve, self-merge, or enable auto-merge.
- Never change repository settings, security controls, credentials, or CI
  workflow policy as ordinary feature work.
- Never deploy production without a separate owner gate.
- Staging writes require a pre-change backup/pointer and exact rollback path.
- Create or update a Draft PR and return control to Luna.
- Luna reviews the whole diff, reruns required tests, and chooses PASS/FAIL for
  the implementation slice; Terra supervises milestone-level GO/BLOCK and the
  next commercial priority.
- A passing local test is not runtime or customer evidence.

The dispatcher must fail closed when this file is absent and must complete
repository-policy/bootstrap checks before allowing a worker to read or execute
a task packet. No worker may bypass the dispatcher or write outside its
approved worktree.
