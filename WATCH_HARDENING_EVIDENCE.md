# Watch Hardening PR Evidence

- Base: merged SocialOreo `main` at `a76d0d70cef124f7e4884ffaf3b04f436b73d06e`.
- Branch: `codex/watch-hardening-a76`.
- Scope: existing public snapshot Watch path and saved competitor board only.
- Excluded: Task 3 scheduler foundation, production, Square, payments, Prompt Ola, browser sessions, email, publishing, global search, and uncapped scans.

## Implemented release-critical behavior

- Watch actions require an authenticated workspace-owned saved competitor.
- Watch count is bounded by the existing plan entitlement and hard-capped at three.
- Watch is explicit opt-in per saved competitor.
- Only weekly (`168h`) and fortnightly (`336h`) cadence values are accepted.
- Capture keys and database upsert make a cadence-window capture idempotent.
- Pause is workspace-scoped, and a canceled monitor is checked again before persistence.
- Failed refreshes retain the prior baseline, store a sanitized reason, and retry within 24 hours.
- Provider cost estimates are stored and shown per capture; existing monitors are backfilled in the migration.
- Captured public source URLs and capture timestamps are persisted and displayed.

## Validation

- Prisma Client generation: passed.
- Prisma schema validation: passed.
- Focused Watch, ownership, idempotency, cancellation, retry, cadence, and cost tests: 5 files, 16 tests passed.
- Typecheck: passed.
- Lint: passed.
- `git diff --check`: passed.
- Fallback secret scan: clean; `gitleaks` and `trufflehog` unavailable.
- Local full suite: timed out after 300 seconds without a test failure result; protected CI is required for the authoritative full-suite result.
- Local build: timed out after 240 seconds without a build failure result; protected CI is required for the authoritative build result.
- Local PostgreSQL/Docker restore verification: unavailable because neither Docker nor PostgreSQL client tools are installed. No review deployment was performed because deployment requires the next owner-approved checkpoint.
- Protected CI run `30668507953` on head `360a1f05f9e80769c43cf452ea4133458c5d7003`: passed. Prisma migration deploy, lint, typecheck, full test suite, and build all passed.

## Merge-review fix (2026-08-03)

Independent reviewers confirmed a hard-cap bypass: removing a competitor from the board deleted the board row but left its enabled Watch monitor running, so the enabled-monitor count in `startCompetitorWatch` no longer included it and the three-competitor cap could be exceeded (with an unpausable provider-cost source).

- Fix: `removeCompetitorFromBoard` now resolves the owned audit's `profileUrl` (scoped by `userId`), deletes the board row, and pauses the matching monitor with `enabled: false, nextCaptureAt: null`.
- Regression tests: added to `actions.watch.test.ts` (6/6 passing), covering pause-on-remove and no-op for a foreign audit.
- Full suite: 64 files / 199 tests passed, 1 skipped.
- Typecheck, lint, and build: passed.
- Final PR #4 head: `3d3d3cf03333a0ac2c50b84e0cf108d310797628` on `codex/watch-hardening-a76`.

## Atomic-transaction checkpoint (2026-08-03)

An independent review of the initial merge-review fix found the two mutations were still issued as separate top-level Prisma calls, so a failure between them could leave a partial removal (entry deleted but monitor still enabled).

- Fix: both mutations now run inside one `prisma.$transaction(async (transaction) => { ... })`, so `CompetitorBoardEntry.deleteMany` and `PublicProfileMonitor.updateMany` commit or roll back together. No schema change, so no migration was required.
- Ownership/isolation preserved: the audit is resolved with `where: { id: auditJobId, userId: account.id }`, and both mutations are scoped by `userId: account.id`; a foreign or unresolvable audit returns before any mutation.
- Tests added in `actions.watch.test.ts` (8/8 passing) prove: (1) owned removal deletes the entry and pauses the monitor, (2) a foreign audit changes nothing, (3) both mutations run inside one `$transaction`, (4) a transaction failure cannot leave a partial removal (top-level mutations never invoked), and (5) the three-watch cap remains protected.
- Real-database atomicity verified on a disposable PostgreSQL 17.10 cluster: both mutations commit together, and a forced rollback inside the transaction leaves no partial state (`REAL_DB_ATOMICITY: PASS`).
- LangGraph checkpoint orchestration: real `@langchain/langgraph` v1.4.8 + `@langchain/langgraph-checkpoint` graph with `MemorySaver` checkpointer drove and recorded the phases (8 checkpoint history entries in `/tmp/opencode/lg-orchestration/checkpoint-history.json`). No simulated capability.
- Validation on this checkpoint:
  - `prisma generate`: passed.
  - `prisma validate`: passed.
  - `prisma migrate deploy` on disposable PostgreSQL 17.10: all migrations applied; schema up to date.
  - Focused Watch tests: 8/8 passed.
  - All Watch tests: 5 files / 20 tests passed.
  - Full suite: 64 files passed, 1 skipped; 201 tests passed, 1 skipped.
  - Lint: passed.
  - Typecheck: passed.
  - Production build: passed.
  - `git diff --check`: passed.
  - Secret scan: no secret patterns in diff; `gitleaks` and `trufflehog` unavailable (fallback regex scan clean).
  - Scope check: only `src/app/dashboard/actions.ts` and `src/app/dashboard/actions.watch.test.ts` changed.
- Independent reviewer subagent verdict on the final actual diff: **APPROVED** — 9/9 dimensions PASS (atomicity, ownership, workspace isolation, idempotency, cancellation, migration safety, sanitized errors, test adequacy, three-cap protection).
- Checkpoint head: `c9ea61b7886e9e66c87b20124bf5fd511b35a9be` on `codex/watch-hardening-a76` (pushed; remote `refs/heads/codex/watch-hardening-a76` and `refs/pull/4/head` both at `c9ea61b`).

## Stop boundary

No worker is enabled, no real watchlist is enabled, and no provider call was made by the test suite. PR #4 remains a draft until protected CI supplies the full test, migration, and build result. Do not merge or deploy from this checkpoint.
