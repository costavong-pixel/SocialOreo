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

## Stop boundary

No worker is enabled, no real watchlist is enabled, and no provider call was made by the test suite. PR #4 remains a draft until protected CI supplies the full test, migration, and build result. Do not merge or deploy from this checkpoint.
