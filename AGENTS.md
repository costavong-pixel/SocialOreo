# SocialOreo Agent Instructions

This file is the permanent repository policy for Hermes, Codex Desktop, and
GPT-5.3 Codex Spark workers. The current Hermes GitHub task issue supplies
only the changing feature scope.

## Model roles

- Hermes using GPT-5.6 Luna is the project and product coordinator.
- GPT-5.3 Codex Spark is the bounded implementation worker.
- Spark cannot redefine scope, approve its own work, declare product
  completion, merge a pull request, or authorize production.

## Customer-feature completion

Backend or engine implementation alone is not a finished customer feature.
The applicable Hermes acceptance contract must pass all relevant gates:

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
documents it references before reading the current Hermes GitHub task issue.
The issue is the only variable scope and should contain only:

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

If the issue conflicts with this policy, the worker must mark the task
`BLOCKED` and return the exact conflict to Hermes/Luna. Do not silently choose
which instruction to ignore.

## Work and delivery rules

- Implement only the bounded task issue.
- Work only on `codex/*` branches.
- Never push directly to `main`.
- Never force-push, self-approve, self-merge, or enable auto-merge.
- Never change repository settings, security controls, secrets, or workflows as
  ordinary feature work.
- Never deploy production without separate owner authorization.
- Create or update a Draft PR and return control to Hermes/Luna.
- Hermes/Luna determines PASS/FAIL and chooses the next task.

The dispatcher must fail closed when this file is absent and must complete the
repository-policy/bootstrap checks before allowing a worker to read or execute
the task issue.
