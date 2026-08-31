# SocialOreo Agent Instructions

This is the permanent repository policy for the SocialOreo/SocialOlla
engineering workflow. A current task packet supplies only the changing,
bounded feature scope; it does not override these controls.

## Model roles and authority

- GPT-5.6 Luna is the Manager: coordinator, integrator, architecture owner,
  actual-diff reviewer, PR authority, staging authority, and final reporter.
- Hermes is the bounded worker dispatcher. When a qualified worker is
  available, Hermes may invoke the isolated DeepSeek API worker under the
  `socialolla-ai` identity for a specific implementation or forensic task.
- GPT-5.3 Codex Spark is not an active assignment lane for this program.
- Workers may propose code, tests, or bounded analysis only. Workers cannot
  redefine scope, approve their own work, declare product completion, merge a
  pull request, authorize staging promotion, or authorize production.
- Requested, actual, and attested model identities must remain distinct in
  evidence. Registration or routing metadata is not execution proof.

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

## Hermes task contract

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
- Luna reviews the whole diff, reruns required tests, and chooses PASS/FAIL and
  the next task. A passing local test is not runtime or customer evidence.

The dispatcher must fail closed when this file is absent and must complete
repository-policy/bootstrap checks before allowing a worker to read or execute
a task packet. No worker may bypass the dispatcher or write outside its
approved worktree.
