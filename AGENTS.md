# SocialOreo / SocialOlla Agent Instructions

This is the permanent repository policy for automated work. A current Hermes GitHub issue supplies only changing, bounded task scope; it never overrides this file.

## Roles

- **Hermes using GPT-5.6 Terra through the ChatGPT/Codex subscription** is the project and product manager. Hermes validates repository governance and issue scope, selects bounded work, coordinates delivery, maintains evidence, and returns `PASS`, `FAIL`, or `BLOCKED`.
- **GPT-5.3 Codex Spark through the ChatGPT/Codex subscription** is the primary implementation worker.
- **GPT-5.6 Luna through the OpenAI API** is the first implementation fallback.
- **DeepSeek V4 Flash through the DeepSeek API** is the second implementation fallback.
- **Z.ai GLM 5.3 Flash through OpenRouter** is the independent reviewer of the exact proposed commit, tests, acceptance contract, and draft PR. It must not be the implementation worker.

No implementation worker may redefine scope, approve its own work, declare product completion, merge, authorize production, or bypass repository governance.

## Required dispatcher order

Every automated task must:

1. Identify the repository.
2. Read this root `AGENTS.md`.
3. Read every repository-authoritative document referenced here.
4. Read the current Hermes GitHub issue/task contract.
5. Validate that the issue does not conflict with this policy.
6. Implement only the approved bounded scope.
7. Run required validation.
8. Create or update a draft PR.
9. Return control to Hermes and the independent reviewer.

If this file is absent, fail closed. If an issue conflicts with this policy, return `BLOCKED` and the exact conflict; never silently choose which instruction to ignore.

## Task contracts

Hermes issues contain only task-specific information:

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

Do not place credentials, tokens, raw customer data, or permanent repository policy in a task issue.

## Product completion

Backend or engine implementation alone is not a finished customer feature. A feature is complete only when its applicable acceptance contract covers:

- engine;
- usable customer UI;
- integration;
- persistence/state;
- success flow;
- failure/error flow;
- customer discoverability and usability;
- required tests; and
- required runtime evidence.

An API endpoint, unit test, worker, service, database model, or merged backend PR does not by itself make a customer-facing capability complete. If existing engine functionality has no usable UI, the feature remains incomplete.

Before adding backend architecture, inspect current `main` and reuse existing Post, Watch, provider, and runtime functionality. Do not unnecessarily rebuild the runtime foundation from PR #23.

## Work and delivery boundaries

- Work only on `codex/*` branches and only within the task issue's allowed areas.
- Never push directly to `main` or force-push.
- Never self-approve, self-merge, or enable auto-merge.
- Never modify GitHub workflows, security settings, repository settings, secrets, DNS, billing, or deployment configuration as ordinary feature work.
- Never deploy production or enable live social, payment, or other provider effects without a separate current owner authorization.
- Create or update a draft PR and return exact diffs, tests, runtime evidence, side-effect counts, rollback information, and blockers to Hermes.
- Hermes and the independent reviewer decide whether the proposed work passes; the owner retains merge and production authority.

## Automatic model fallback and review evidence

Hermes must route implementation in this order:

1. GPT-5.3 Codex Spark.
2. GPT-5.6 Luna only when Spark has a genuine quota, rate-limit, overload, connection, or provider-availability failure.
3. DeepSeek V4 Flash only when Spark and Luna have genuine quota, rate-limit, overload, connection, or provider-availability failures.

Hermes must not switch models because code, tests, validation, or review failed. Those failures require repair within the approved scope. A fallback is allowed only for model/provider availability, and Hermes must record the failed stage and evidence-based reason.

Every implementation task must record:

```text
IMPLEMENTATION_PROVIDER: <provider actually used>
IMPLEMENTATION_MODEL: <model actually used>
FALLBACK_STAGE: NONE | SPARK_TO_LUNA | LUNA_TO_DEEPSEEK
FALLBACK_REASON: NONE | QUOTA_EXHAUSTED | RATE_LIMITED | PROVIDER_OVERLOADED | CONNECTION_FAILURE | PROVIDER_UNAVAILABLE
REVIEWER_PROFILE: independent-review
REVIEWER_PROVIDER: openrouter
REVIEWER_MODEL: z-ai/glm-5.3-flash
review_head_sha: <exact final commit reviewed>
```

The implementation worker may not act as reviewer, regardless of which fallback stage supplied it. GLM 5.3 Flash may review but may not implement, approve, merge, release, deploy, or declare product completion. If the independent reviewer is unavailable, the task is `BLOCKED`.
