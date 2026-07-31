# Dependency Security PR Evidence

- Base release: `d868fcd300b08133d676fd5bb7271370dbedb85e`
- Branch: `codex/dependency-security-d868`
- Scope: dependency manifests and lockfile only. No payment, Square, database, production, Prompt Ola, or review deployment changes.

## Audit baseline

The baseline was measured from the exact release after a clean lockfile install.

- `npm audit --audit-level=high`: 15 high findings, 0 critical findings in the full dependency tree.
- `npm audit --omit=dev --audit-level=high`: 3 high runtime findings involving Next.js, PostCSS, and Sharp.
- The requested 12-high count did not match the current exact-head lockfile; the exact local audit output is recorded here as authoritative for this PR.

## Narrow compatible remediation

- Pinned `next` to `16.2.12`.
- Pinned `eslint-config-next` to `16.2.12`.
- Pinned `@tailwindcss/postcss` and `tailwindcss` to `4.3.3`.
- Pinned `autoprefixer` to `10.5.4`.
- Pinned PostCSS to `8.5.18` directly and through the existing override.
- Added the Sharp `0.35.0` override for the runtime advisory.
- Did not use `npm audit fix --force` or broad major upgrades.

## Final audit

- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `npm audit --audit-level=high`: 9 remaining high findings, all in development/build-only `brace-expansion`/`minimatch` paths through ESLint and TypeScript-ESLint.
- A global `brace-expansion@5.0.9` override was tested and reverted because it broke ESLint 9 with `expand is not a function`. The remaining dev-only findings were not force-fixed because doing so would destabilize the compatible lint toolchain.

## Validation evidence

- Prisma Client generation and schema validation passed.
- Focused Square tests: 14 files and 60 tests passed.
- Full suite: 62 test files passed, 1 skipped; 188 tests passed, 1 skipped.
- Typecheck passed.
- Lint passed.
- Production build passed with Next.js `16.2.12`; 26 static pages generated.
- `git diff --check` passed.
- Fallback secret-pattern scan of changed files was clean; `gitleaks` and `trufflehog` were unavailable in the environment.
- No migration, payment, Square, production, Prompt Ola, browser, or deployment operation was performed.

## Gate status

This PR is ready for review as a draft. TASK 2 remains gated on this PR being merged and exact-head CI passing. No tester or real watchlist is enabled.
