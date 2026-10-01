# SocialOreo / SocialOlla Agent Instructions

This is the permanent repository policy for automated work. A current Hermes GitHub issue supplies changing, bounded task scope and must not weaken these protections.

## Operating roles

- **Hermes using GPT-5.6 Terra** is the default project/product manager and coordinator.
- **Implementation is capability-based, not CLI-based.** Hermes may implement with its native tools or delegate to any configured, approved worker that fits the task.
- **GPT-5.6 Luna** is the currently verified implementation worker.
- **DeepSeek V4 Flash** remains an approved low-cost implementation worker/fallback. Preserve its configured credential and routing unless the owner explicitly authorizes a change. A failed probe requires diagnosis and temporary use of another verified worker, not disabling or deleting DeepSeek.
- **Z.ai GLM 5.3 Flash through OpenRouter** is the independent exact-commit reviewer. It must not implement the change it reviews.

Codex CLI, Codex Spark, and any other particular coding CLI or model are optional. Their absence must not block work when an approved worker is available.

No implementation worker may redefine scope, approve its own work, declare product completion, merge, authorize production, or bypass repository governance.

## Required dispatcher order

Every automated task must:

1. Identify the exact repository, worktree, branch, base SHA, and current changes.
2. Read this root `AGENTS.md` and the current GitHub issue/task contract.
3. Read the repository evidence and tests relevant to the requested behavior.
4. Validate that the task contract does not conflict with this policy.
5. Preserve unrelated changes and implement only the approved bounded scope.
6. Run focused validation, investigate failures, and run proportionate regression checks.
7. Obtain independent review of the exact final commit.
8. Create or update one draft PR for the milestone when the task contract authorizes delivery.
9. Return factual evidence, remaining risks, and owner-only actions.

If this file is absent or the issue conflicts with it, fail closed and report the exact conflict.

## Task contracts and standing autonomy

Task issues should contain the applicable fields:

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
AUTONOMY_MODE: BOUNDED_IMPLEMENTATION | READ_ONLY | OWNER_CHECKPOINTS
```

`AUTONOMY_MODE: BOUNDED_IMPLEMENTATION` is standing authorization for repository discovery, an isolated `codex/*` or `hermes/*` branch/worktree, edits inside `ALLOWED_AREAS`, tests, debugging, documentation, commits, feature-branch pushes, issue evidence updates, independent review, and a draft PR. Do not repeatedly request approval for those routine steps.

It never authorizes merge, production deployment, live provider effects, payments, purchases, credentials, repository/security setting changes, destructive data changes, or broader scope.

Do not place credentials, tokens, raw customer data, or permanent personal information in a task issue.

## Multiple-project isolation

Hermes may coordinate multiple products, but each repository milestone must have its own task contract, isolated worktree, branch, state, tests, and draft PR. Use one writer per worktree. Never reuse credentials, databases, customer data, deployment state, or uncommitted files across projects. On this VPS, run no more than two implementation children concurrently; queue additional work by owner priority.

## Model selection and evidence

Model selection is an operating decision, not an owner-interruption point.

- Prefer the lowest-cost verified worker capable of the bounded task.
- Use Luna when complexity, tool reliability, or unavailable cheaper workers require it.
- Keep DeepSeek available as the approved low-cost fallback. Use it for work only after a fresh provider probe succeeds; if the probe fails, diagnose without deleting, disabling, rotating, or replacing its credential or routing.
- A missing optional CLI is `AVAILABLE_WORKER_NOT_SELECTED`, not a task blocker.
- Do not change workers to conceal code, test, validation, or review failures; diagnose and repair them.
- Never claim a provider/model ran without direct evidence.

Every delivered implementation records:

```text
IMPLEMENTATION_PROVIDER: <provider actually used>
IMPLEMENTATION_MODEL: <model actually used>
MODEL_SELECTION_REASON: <capability, cost, or availability reason>
REVIEWER_PROVIDER: openrouter
REVIEWER_MODEL: z-ai/glm-5.3-flash
review_head_sha: <exact final commit reviewed>
```

The reviewer must differ from the implementation worker. If no independent reviewer is available, the delivery is `BLOCKED` and must not be represented as complete.

Respect external provider caps. Never purchase credits, raise billing limits, or modify credentials as ordinary repository work.

## Product completion

Backend or engine code alone is not a finished customer feature. Applicable acceptance must cover:

- engine behavior;
- usable customer UI;
- integration and account/workspace isolation;
- persistence and state transitions;
- success and failure behavior;
- customer discoverability;
- focused and regression tests; and
- required runtime/provider evidence.

Before adding backend architecture, inspect current `main` and reuse existing Post, Watch, provider, identity, credit, and runtime foundations. Do not label provider-disabled, mocked, source-only, or health evidence as real customer/provider acceptance.

## Work and delivery boundaries

- Never work directly on `main`, force-push, self-approve, self-merge, or enable auto-merge.
- Preserve unrelated dirty work and use explicit file staging.
- Never modify GitHub workflows, repository/security settings, secrets, DNS, billing, databases, or deployment configuration as ordinary feature work.
- Never deploy production or enable live social, payment, messaging, or other provider effects without current owner authorization.
- Keep tokens, cookies, authorization codes, private keys, raw OAuth state, raw provider errors, and customer data out of Git, issues, tests, UI, and reports.
- Report exact diffs, tests, review evidence, side effects, rollback information, and blockers.
- The owner retains merge and production authority.

## Failure and continuation rules

Continue through routine implementation without asking the owner to choose tools or models. Retry only transient failures and keep retries bounded. Diagnose repeated failures from logs, code, tests, and runtime evidence. Preserve completed checkpoints. Ask the owner only for a material product decision or authority involving merge, production, external provider action, credentials, money, legal consent, or destructive change.
