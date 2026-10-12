# SocialOlla Project State — 2026-08-27

This document is the durable handoff for the SocialOlla recovery/completion program. It intentionally separates **verified GitHub facts** from **agent-reported runtime/local facts** so future sessions do not turn assumptions into facts.

Do not treat old milestone labels such as `PASS`, `DONE`, or `customer-ready` as authoritative unless the evidence below supports them.

## Evidence labels

- **VERIFIED** — independently confirmed from GitHub at the time this document was written.
- **REPORTED** — reported by Codex from staging/local/runtime checkpoints; not independently reproduced by this document writer.
- **DEFERRED** — intentionally postponed by owner decision.
- **UNKNOWN** — no trustworthy current evidence.

## Repository authority

### GitHub main

**VERIFIED**

Repository: `costavong-pixel/SocialOreo`

Current GitHub `main`:

`467b39e6870e60d3a2cb21e208000af782d86231`

Commit message:

`feat: SocialOlla foundation and staging auth acceptance (#19)`

PR #19 is merged into main. PR #18 was closed unmerged after its canonical-shell work was superseded by the later foundation/profile/auth stack.

### Current development candidate

**REPORTED**

Working branch:

`codex/watch-staging-completion`

Latest committed local/pushed candidate checkpoint:

`3942075b3915159b50c903a0565b1ccc97861ba6`

This branch is ahead of GitHub main and has no open PR in the latest checkpoint.

The diff from GitHub main was reported as 96 files, approximately `+4,554/-684`.

### Latest uncommitted work after `3942075...`

**REPORTED — IMPORTANT**

At the latest hard-stop checkpoint, additional provider-boundary/workspace/reconciliation work existed **uncommitted** on top of `3942075...`. The committed SHA therefore does **not** represent the newest local source tree.

Reported changed source files included:

- `src/lib/instagram-publishing/publish-client.ts`
- `src/lib/instagram-publishing/publish-client.test.ts`
- `src/lib/socialolla/content-factory/post-service.ts`
- `src/lib/socialolla/content-factory/post-service.test.ts`
- `src/lib/socialolla/post/post-actions.ts`
- `src/lib/socialolla/post/post-actions.test.ts`
- `src/lib/socialolla/publishing/instagram-provider.ts`
- `src/lib/socialolla/publishing/instagram-provider.test.ts`
- `src/lib/socialolla/publishing/job-service.ts`
- `src/lib/socialolla/publishing/job-service.test.ts`
- `src/lib/socialolla/publishing/provider.ts`
- `src/lib/socialolla/publishing/publish-worker.ts`
- `src/lib/socialolla/publishing/publish-worker.test.ts`

The latest reported targeted provider-boundary verification was 75/75 passing before full milestone verification resumed. No final preservation commit SHA for those newest edits was reported in the supplied record.

**Recovery rule:** before discarding/replacing the current Codex worktree, preserve or explicitly inspect this uncommitted work. Do not assume `3942075...` contains it.

## Staging authority

**REPORTED**

Latest deployed staging runtime SHA:

`12fde638c5d4d641390a94e0480ade005f3389f9`

Reported release path:

`/srv/socialolla/releases/12fde638c5d4d641390a94e0480ade005f3389f9-post-watch-staging-20260826T195737Z`

Reported manifest SHA-256:

`acf102419a490d98ecc8346d1c0a40cbfce5c18903b6fdd559669a15f3ecd347`

Reported health response:

```json
{
  "ok": true,
  "service": "socialolla",
  "phase": "phase-1-foundation",
  "environment": "staging",
  "revision": "12fde638c5d4d641390a94e0480ade005f3389f9"
}
```

Reported runtime details:

- `socialolla-staging.service`: active/running
- application bound to `127.0.0.1:3004`
- Content Factory process active on `127.0.0.1:8001`
- backup timer installed/enabled
- dedicated Post worker service/timer: **not installed/running**
- dedicated Watch worker service/timer: **not installed/running**
- only one-shot scripts such as `post-worker:once` and `watch-worker:once` exist in the reported state

**Critical:** staging is not reported to be running `3942075...` or the later uncommitted work.

## Production boundary

**REPORTED consistently across checkpoints**

- Production was not modified by the recent Post/Watch/foundation completion program.
- Production DB was not modified by the recent completion program.
- No live provider enablement was performed.
- Real payments remained zero.

Do not infer production readiness from staging/local tests.

## Foundation / account / shell

### Implemented or substantially fixed

**REPORTED**

- Canonical SocialOlla shell/navigation exists.
- Unified Dashboard exists at `/home`.
- `/dashboard` is a compatibility redirect to `/home`.
- `/post` is a compatibility redirect to `/posts`.
- Profile/account context exists.
- Auth0 identities are bound to the exact Auth0 subject in the canonical sync path.
- New staging bootstrap users are created as `USER`, not automatically `ADMIN`.
- Exactly one personal Workspace is created/reused for the normal staging user path.
- Admin navigation is role-gated.
- Health/revision metadata was added so staging release identity can be checked.
- Staging acceptance bootstrap has a production-denial boundary.
- Provider-disabled runtime paths were hardened to fail closed.
- Customer-visible legacy SocialOreo/provider-disabled copy was reduced in newer staging commits.

### Normal staging USER state

**REPORTED**

The normal staging acceptance identity has:

- canonical User row: YES
- role: `USER`
- Workspace count: exactly 1
- Workspace label: `Personal workspace`
- bootstrap audit record: present
- Auth0 provider claim `email_verified`: `false`
- staging-only acceptance override: active

The staging override is an exception for testing. It must not be treated as proof that production verified-email behavior is ready for this account.

### Outstanding foundation acceptance

**REPORTED / NOT PROVEN ON LATEST CANDIDATE**

- authenticated normal USER acceptance on the latest candidate
- authenticated ADMIN acceptance on the latest candidate
- current Profile visual acceptance
- current `/home` visual acceptance
- current 10/10 first-click navigation acceptance
- current screenshots/visual evidence on the newest exact candidate

Previously passed acceptance on older releases remains useful evidence only where the newer diff does not invalidate it. Use change-impact analysis before rerunning broad checkpoints.

## Dashboard / customer shell

**REPORTED**

The canonical SocialOlla shell is intended to expose:

- Dashboard
- Posts
- Watch
- Calendar
- Connections
- Credits
- Analysis
- Assistant
- Settings
- Profile/account context
- Admin only for authorized ADMIN users

The legacy SocialOreo dashboard is no longer intended to be the canonical customer shell.

However, current exact-candidate authenticated visual acceptance is not proven in the latest checkpoint.

## Post

### Current reported maturity

**REPORTED:** level approximately **2/5 (local backend)** on the latest conservative checkpoint.

### Implemented in source/local contracts

- draft creation/editing
- media ownership/security foundations
- platform variants
- destinations
- scheduling state
- publish-job model/service
- retry/cancel/reschedule contracts
- credit hold/finalize/refund hooks
- provider-receipt contracts
- guarded Instagram provider code
- provider/publishing action guards

### Not yet proven/customer-ready

- real Meta OAuth consent
- real eligible Instagram publishing destination
- encrypted token lifecycle against a real provider session
- real Instagram publish
- real provider post/media receipt
- scheduled Post execution by a running worker/timer
- real retry/failure/reconciliation
- cancel/reschedule against running execution
- multi-destination real-provider behavior
- real provider chaos/race acceptance

### Worker status

**REPORTED:** dedicated Post systemd worker/timer is not installed/running.

## Watch

### Current reported maturity

**REPORTED:** level approximately **2/5 (local backend)** on the latest conservative checkpoint.

### Implemented in source/local contracts

- immediate Watch flow
- scheduled capture worker code
- Workspace ownership
- credit hold/finalize/refund
- leases/idempotency
- retry handling
- provider-result sanitization
- snapshots/evidence/delta foundations
- durable Watch scheduling code

### Not yet proven/customer-ready

- live provider enabled in staging
- real Watch capture #1
- automatic capture #2
- real delta/history evidence
- real provider retry
- real failure/refund proof
- repeated scheduled execution
- operational alerts

### Worker status

**REPORTED:** dedicated Watch systemd worker/timer is not installed/running.

## Social provider / OAuth matrix

Latest conservative reported matrix:

| Platform | Current status |
|---|---|
| Instagram | Auth/provider code present; real OAuth/publish/Watch acceptance not proven |
| Facebook Pages | Not implemented as a verified launch provider |
| TikTok | Partial public read/audit/provider code; no real connected publishing OAuth/token path proven |
| Pinterest | Not implemented |
| LinkedIn | Not implemented |
| X/Twitter | Not implemented |
| YouTube | Trend/audit references only; no real connected publishing path proven |
| Threads | Not implemented |

Do not claim "all platforms" support until each provider has explicit connection, token, execution, and real-provider evidence.

## Content Factory

**REPORTED**

- process/systemd: active
- reported port: `127.0.0.1:8001`
- used as the content-generation/draft/review foundation for Post
- it is **not** itself proof of social publishing

Outstanding proof:

- authenticated internal health
- Content Factory's own data/DB reachability through its intended service identity
- end-to-end Post → Content Factory → usable draft on the final candidate
- remaining internal legacy service identity such as `X-SocialOlla-Service: socialoreo` should be reconciled if still current

## Credits — duplicate authority remains

**REPORTED CONFLICT**

Newer SocialOlla authority candidates:

- `CreditBatch`
- `CreditTransaction`
- batch hold/finalize/refund service

Legacy writers still reported active:

- `CreditAccount`
- `CreditLedger`
- legacy audit consumption
- older Square/settlement paths

No production reconciliation/migration has been executed.

**Outstanding:** choose/enforce one canonical new-write authority, preserve historical value, then clone-rehearse any reconciliation before production mutation.

## Entitlements — duplicate authority remains

**REPORTED CONFLICT**

Newer authority candidates:

- `PlanVersion`
- `EntitlementSnapshot`

Legacy authority still reported active:

- `User.accessPlan`
- legacy plan-limit/fallback resolution
- some payment-derived compatibility paths

No production reconciliation/migration has been executed.

**Outstanding:** choose/enforce one runtime authority before production payment acceptance.

## Payments

**REPORTED**

Implemented/tested foundations include:

- Square sandbox configuration/code
- checkout routes/guards
- webhook signature verification code/tests
- idempotency/claim tests
- payment amount/currency fail-closed work merged previously

Still outstanding:

- current staging checkout acceptance on the final application candidate
- actual webhook delivery acceptance
- subscription/entitlement update through the chosen canonical entitlement authority
- credit effects through the chosen canonical credit authority
- refund lifecycle acceptance through the final authority model
- production readiness

Real payments remain zero in the supplied checkpoints.

## Legacy cleanup

Compatibility/history is not automatically a defect. Outstanding legacy cleanup is specifically about **conflicting execution or write authority**, not blindly deleting old data/routes.

Reported remaining items include:

- `/dashboard` compatibility redirect
- `/post` compatibility redirect
- legacy `/audits/...` Analysis compatibility paths
- internal `socialoreo` names in code/CSS/cookies/service identities
- legacy audit models
- duplicate credit writers
- duplicate entitlement logic
- legacy Watch/provider paths overlapping newer SocialOlla paths

No production historical data should be deleted merely because it is legacy.

## Test quality evidence

### Exact committed candidate `3942075...`

**REPORTED**

- Vitest: 575 passed, 1 skipped
- 116 test files
- lint: PASS
- typecheck: PASS
- Prisma validate/generate: PASS
- production build: PASS
- diff check: PASS

Mutation contracts reported:

- Post: 9/9 killed
- Social provider: 7/7 killed
- Watch: 8/8 killed
- earlier Auth mutation contract: 8/8 killed

### Remaining test-quality gaps

- no current authenticated Playwright/customer acceptance on the final candidate
- no real Instagram OAuth/post
- no real Watch provider capture
- many provider tests rely on mocks/provider-disabled fixtures
- no current-candidate screenshots
- no real worker execution proof

Do not treat HTTP 200, unit tests, mocks, or provider-disabled fixture success as customer readiness.

## Security

### Owner decision

**DEFERRED:** full final security review will be run after the application is functionally complete.

### Current evidence

**REPORTED**

A sealed current-head security review for committed `3942075...` was later reported as 0 reportable findings. The latest **uncommitted** provider-boundary changes after that commit are not necessarily covered by that sealed scan.

Dependency audit previously reported high/moderate advisories; final triage remains outstanding.

Final security must cover the exact final source tree, not an earlier SHA.

## Outstanding application work — factual list

The following remain outstanding in the supplied checkpoints:

1. Preserve/finalize the latest uncommitted provider-boundary candidate so it has an exact SHA.
2. Deploy one exact finished candidate to staging and prove runtime revision identity.
3. Run exact-release authenticated USER and ADMIN customer acceptance.
4. Finish real Instagram OAuth/connection acceptance.
5. Finish real Instagram Post acceptance and provider receipt.
6. Install/run the Post worker/timer and prove scheduled publishing.
7. Finish real Watch provider acceptance.
8. Install/run the Watch worker/timer and prove repeated automatic captures/deltas/refunds.
9. Resolve duplicate credit authorities.
10. Resolve duplicate entitlement authorities.
11. Finish Content Factory authenticated integration/data reachability proof.
12. Finish staging payment/webhook/refund/subscription acceptance against the canonical authorities.
13. Implement/verify additional social providers (Facebook Pages, TikTok publishing, Pinterest, LinkedIn, X/Twitter, YouTube publishing, Threads) according to product priority.
14. Neutralize conflicting legacy execution/write paths while preserving valid historical data and compatibility routes.
15. Perform one final exact-release customer acceptance after functional completion.
16. Perform the final security/dependency review on the exact final application tree.

## Items already substantially implemented — do not restart from zero

Do not send future agents back to rebuild these from scratch without evidence that they regressed:

- canonical SocialOlla shell
- `/home` Dashboard architecture
- `/dashboard → /home`
- `/post → /posts`
- Profile/account context
- canonical staging USER bootstrap
- one personal Workspace creation/reuse
- Admin role gating
- exact Auth0 subject binding
- staging acceptance bootstrap with production denial guard
- health/revision metadata
- Post backend architecture
- Watch backend architecture
- Post/Watch/provider mutation contracts
- Content Factory process installation
- backup timer
- Square core code/tests

## Verification policy going forward

1. The latest durable checkpoint remains valid until newer evidence contradicts it.
2. Do not downgrade a previously established fact to UNKNOWN without evidence.
3. Before rerunning broad verification, compare last trusted checkpoint → current diff and determine which evidence is invalidated.
4. Rerun only invalidated gates during implementation; run the full product/security acceptance once on the final exact candidate.
5. Distinguish:
   - **VERIFIED FACT**
   - **REPORTED FACT**
   - **INFERENCE**
   - **UNKNOWN**
6. Never call a feature `customer-ready` without real customer/provider evidence where applicable.
7. Do not ask the owner to repeat login unless a genuinely missing/expired session is proven.

## Recommended execution order after the current candidate is preserved

This is a **planning recommendation**, not a verified fact:

1. Preserve/finalize current candidate.
2. Establish one exact staging release identity and customer acceptance baseline.
3. Finish canonical credit/entitlement authority decisions before production payments.
4. Complete Instagram Post end-to-end.
5. Complete Instagram Watch end-to-end.
6. Complete payment lifecycle against canonical authorities.
7. Add further social providers according to priority.
8. Run final visual/customer acceptance.
9. Run final exact-head security/dependency review.
10. Prepare production cutover only after the product is functionally complete.

## Safety boundaries

Until explicitly approved otherwise:

- no production deployment
- no production DB mutation
- no real customer payments
- no unreviewed live-provider enablement
- no destructive deletion of historical customer data

## Why this file exists

The project accumulated many long-running agent sessions, local-only branches, staging-only releases, and legacy/new implementation overlap. This file is intended to prevent future sessions from losing the project state, repeating already-proven work, or mistaking mocked/provider-disabled behavior for a finished product.
