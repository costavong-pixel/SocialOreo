# SocialOreo / SocialOlla Agent Instructions

This is the permanent repository policy for automated work. A current Hermes GitHub issue supplies only changing, bounded task scope; it never overrides this file.

## Roles

- **Hermes using GPT-5.6 Luna** is the project and product coordinator. Hermes validates repository governance and issue scope, selects bounded work, maintains evidence, and returns `PASS`, `FAIL`, or `BLOCKED`.
- **GPT-5.3 Codex Spark** is the preferred implementation worker.
- **DeepSeek** is an implementation fallback only when Spark is unavailable and Hermes records the fallback reason.
- **An independent reviewer** checks the exact proposed commit, tests, acceptance contract, and draft PR. The reviewer must not be the implementation worker.

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

## DeepSeek fallback

When Spark is unavailable, Hermes may assign DeepSeek a tightly bounded implementation task only when the issue records:

```text
IMPLEMENTATION_MODEL: deepseek-...
FALLBACK_REASON: PRIMARY_CODER_UNAVAILABLE | SPARK_UNAVAILABLE | SPARK_QUOTA_EXHAUSTED | SPARK_PROVIDER_OUTAGE
REVIEWER_PROFILE: <different named reviewer profile>
REVIEWER_MODEL: <non-DeepSeek reviewer model>
```

The exact final commit must be recorded as `review_head_sha`. DeepSeek may not approve, merge, release, or declare completion. If the independent reviewer is unavailable, the task is `BLOCKED`.
