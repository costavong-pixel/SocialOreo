PROJECT: SocialOlla
TASK: Finish Milestone 2 through a few-agent engineering loop
THREAD: socialolla-m2-revenue-beta
STOP: OWNER_REVIEW_GATE

NON-NEGOTIABLE:
- Use the real installed /saveruflo.
- Use actual LangGraph with durable checkpoints.
- Do not merge, deploy, change DNS, use live OAuth/providers, publish real content,
  collect real payments, mutate production data, or touch Content Factory PR #77.
- Do not finish with deferred M2 pre-merge work.

CURRENT VERIFIED REMOTE STATE — REFRESH BEFORE WORK

SocialOreo
- Repo: costavong-pixel/SocialOreo
- M1 baseline: ec9ac0e4ad627078c31206b8b7ed4c13421542a1
- Worktree: /home/debian/work/SocialOlla-m2
- Branch: milestone/socialolla-m2-revenue-beta
- Draft PR: #7
- Known head: e1b987c4f1ab672aef807b64ff368ef1b9ec1da2
- Protected CI run 30877622637: success on that exact head

Content Factory
- Repo: costavong-pixel/barnd-ai-content-agent
- M1 baseline: 05626ae465206a0622182db8c7c405ff51f59db6
- Create milestone/socialolla-m2-post-beta only if verified CF defects remain.
- Keep PR #77 untouched.

Fetch both origins, verify exact heads/PR/CI, then update the durable checkpoint.
Remote Git state overrides stale checkpoint text.

USE ONLY SIX AGENT ROLES

1. COORDINATOR / LOOP ENGINEER
   Owns the graph, assigns work, integrates, updates checkpoints and PR metadata,
   writes only small integration fixes, and loops until completion. It cannot
   independently approve its own work.

2. BACKEND / DATA / SECURITY INSPECTOR
   Read-only by default. Audits schema, migrations, auth, workspace isolation,
   credits, entitlements, Square sandbox, Post, Watch, provider guards, assistant,
   admin actions, idempotency, audit events and rollback.

3. PRODUCT / UI / JOURNEY INSPECTOR
   Read-only by default. Audits actual routes and running customer journey:
   landing, demo, signup, onboarding, destinations, Post, Watch, credits,
   checkout, assistant, admin, mobile, a11y, i18n and RTL.

4. BACKEND / INTEGRATION ENGINEER
   Implements schema, services, server actions, APIs, credit/entitlement logic,
   provider guards, Square sandbox safety, Content Factory client/contract and
   migrations.

5. FRONTEND / PRODUCT ENGINEER
   Implements real routes/components, product shell, onboarding, Post, Watch,
   credits, public funnel, assistant, admin, mobile/a11y and multilingual wiring.

6. TEST / CI / INDEPENDENT REVIEW ENGINEER
   Reads final diffs, designs/runs tests, monitors exact-head CI, rejects skipped
   tests, checks process cleanup, and issues independent GO/BLOCK.

Use real separate agents/subagents when supported. Do not invent agent identities.
Inspectors and the test engineer must review code written by the engineers.

LOOP ENGINEERING GRAPH

START_OR_RESUME
→ PREFLIGHT_AND_SAVERUFLO
→ REFRESH_REMOTE_STATE
→ INVENTORY_AND_CLEAN_WORKSPACE
→ INSPECT_BACKEND_DATA_SECURITY
→ INSPECT_PRODUCT_UI_JOURNEY
→ RECONCILE_FINDINGS
→ BUILD_COMPLETION_LEDGER
→ SELECT_HIGHEST_PRIORITY_FINDING
→ SAVERUFLO_BEFORE_CHANGE
→ ASSIGN_BACKEND_OR_FRONTEND_ENGINEER
→ IMPLEMENT
→ FOCUSED_TESTS
→ PEER_INSPECTION
→ FIX_FINDINGS
→ FOCUSED_RETEST
→ NEXT_FINDING
→ FULL_LOCAL_REGRESSION
→ CROSS_SERVICE_ACCEPTANCE
→ PUSH_FINAL_CHECKPOINT
→ PROTECTED_CI_MONITOR
→ FIX_AND_RETEST_LOOP
→ FINAL_INDEPENDENT_REVIEW
→ END_TO_END_M2_ACCEPTANCE
→ FREEZE_EXACT_HEADS
→ FINAL_SAVERUFLO
→ OWNER_REVIEW_GATE

Loop until the completion ledger contains no unresolved M2 pre-merge finding.
Any code change makes earlier final CI/review stale.
Any security, isolation, duplicate-credit, duplicate-entitlement, duplicate-job,
provider-boundary or production-boundary failure blocks later nodes.

DURABLE CHECKPOINT RECORD FOR EVERY NODE

- node/status/timestamps
- agent
- repo/worktree/branch
- start SHA/end SHA
- files inspected/changed
- commands
- test totals
- CI run/job IDs
- findings opened/closed
- provider-call count
- payment/publishing/production-mutation counts
- rollback point
- next permitted node

Resume after SSH/tmux/OpenCode interruption. Do not restart completed work merely
because the previous model response ended.

FINDING DISCIPLINE

Create numbered findings:
BACKEND-###, DATA-###, SECURITY-###, UI-###, JOURNEY-###, TEST-###, CF-###.

Each finding requires:
- severity
- exact evidence and file/function
- acceptance criteria
- assigned engineer
- focused tests
- rollback
- inspector GO/BLOCK
- final status

“Implemented” requires code + focused green tests + independent inspector review.
“Complete” requires final exact-head protected CI.

M2 COMPLETION SCOPE

A. REAL PRODUCT SHELL
- SocialOlla branding/design tokens
- mobile-first authenticated shell
- Home, Post, Watch, Calendar, Connections, Credits, Assistant, Settings
- loading/empty/error/offline/partial-success states
- language selector and RTL foundation
- keyboard/focus/touch-target support
- no prototype/admin route exposure

B. WORKSPACE AND ONBOARDING
- one race-safe personal workspace per user
- strict cross-workspace isolation
- conversational purpose/profile intake
- approved facts vs suggestions
- accept/edit/reject/skip
- no invented business facts
- sandbox-labelled Instagram/TikTok destinations
- first destination-specific Post
- persisted seven-day plan
- no automatic credit spend

C. PROVIDER-DISABLED POST
- topic/offer/product/link/approved source
- profile + one/multiple destinations
- title/caption candidates
- platform variants
- edit title/caption/hashtags/CTA
- first comment as separate linked action
- scheduled repost as new occurrence
- timezone/capability preview
- approve/schedule in provider-disabled mode
- independent destination statuses/evidence
- review/cancel/retry/idempotency
- exact cost/confirmation/hold/finalize/refund where credits apply
- no live transport

D. PROVIDER-DISABLED WATCH
- profile input/selection and validation
- exact configured credit price
- confirmation and HOLD
- provider-disabled fixture only
- saved report/evidence/profile
- FINALIZE usable success
- exactly-once REFUND failure
- required identity/count/frequency/topic/format/engagement/top-post/strength/
  improvement/direction fields
- no live worker scheduler or paid provider call

E. REVENUE, ENTITLEMENT AND CREDITS
- PlanVersion + EntitlementSnapshot canonical
- config-driven provisional $79 lifetime sandbox plan
- pricing and checkout share one source
- Square sandbox tester gate
- reject production merchant/environment
- settlement grants entitlement exactly once
- CreditBatch + CreditTransaction sole new credit authority
- legacy CreditAccount/CreditLedger read-only for new M2 effects
- monthly periodKey uniqueness and race safety
- purchased credits expire after 12 months
- monthly-first, earliest-expiring purchased second
- HOLD/FINALIZE/REFUND linked and amount-safe
- ADJUSTMENT separate, reason required, audited
- customer balance/batch expiry/ledger UI
- admin override/adjust/refund with audit
- grandfathering/reconciliation and rollback runbook

F. PUBLIC FUNNEL
- Post-first SocialOlla landing page
- accurate Post/Watch copy
- canonical $79 price
- one editable/copyable provider-disabled demo
- one-per-visitor/session control
- no fake failure or bait-and-switch
- consent before guest content transfer
- signup/login CTA
- public assistant limited to safe public help
- guests cannot publish/schedule/read private data/use credits

G. UNIFIED ASSISTANT
- floating panel
- Explain, Draft, ProposeAction, Execute
- guest structural limit to Explain/Draft
- protected preview: account, destination, content, schedule, cost, consequences
- explicit confirmation
- sanitized field-built transcript only
- no secrets, raw payloads, chain-of-thought or cross-user data

H. MINIMUM ADMIN CONTROL PLANE
- plans/prices/effective dates
- feature flags/channel states/fair use
- monthly credits/action prices/packs
- entitlement inspection/override
- manual adjustment/refund
- provider-disable switches
- Post/Watch errors and audit viewer
- version history, preview, impact, confirmation, rollback
- no agency/team administration

BACKEND INSPECTION MUST PROVE

- No path writes both canonical and legacy credits.
- No preview/read/release path mints monthly credits.
- Expired/empty batches are never selected.
- All consumers share one batch selector.
- Finalize/refund cannot occur without a matching hold.
- Concurrent settlement cannot duplicate entitlement or credits.
- Concurrent first access cannot duplicate workspace.
- Every private object is workspace-scoped.
- Guests cannot Execute or access private/credit/schedule actions.
- Provider-disabled guard fails closed at the provider chokepoint.
- Square is sandbox-only and tester-gated.
- External IDs use node:crypto, not Math.random.
- Migrations deploy cleanly from M1 on disposable PostgreSQL.
- Rollback/reconciliation is explicit and testable.

UI/JOURNEY INSPECTION MUST PROVE

A service library without a reachable route and usable UI does not satisfy M2.

Inspect actual src/app routes, server actions, API routes, components and the
running application. Verify every customer step is reachable and persisted.
Reject dead buttons, placeholder cards, static fake data presented as records,
client-only authority, missing loading/error states and hidden unsupported actions.
Use screenshots/browser evidence when tooling exists.

CONTENT FACTORY CHANGE GATE

Read current CF main and verify whether these defects remain:

CF-A: candidates_json response type differs across create/GET/retry.
CF-B: query-string parameters are not included in HMAC request-target signing.
CF-C: staged candidates silently cap requested_count at 10.

When any remain:
- worktree /home/debian/work/SocialOlla-m2-post
- branch milestone/socialolla-m2-post-beta
- one draft PR
- PR #77 untouched

Fix and test:
- one consistent response schema
- normalized query parameters included in client/server HMAC
- tamper/reorder/missing-query tests
- requested_count honors validated safe bounds
- min/normal/max/out-of-range tests
- authenticated read-only health
- sanitized errors
- docs/openapi inaccessible in internal production mode when code-level config
  can safely enforce it
- no deployment or ingress mutation

Run CF authoritative full tests, compile/import/startup/process cleanup, secret
scan, diff check and protected CI on exact final head.

IMPLEMENTATION ORDER

1. Refresh current PR #7 and both repos.
2. Inspect current code; do not assume old gap text is current.
3. Close credit/entitlement/workspace/provider/security blockers.
4. Fix CF A/B/C and client contract if present.
5. Complete backend APIs/actions for onboarding, Post, Watch, credits and admin.
6. Complete product shell and public funnel.
7. Complete onboarding/Post/Watch/credits/assistant/admin UI.
8. Complete multilingual/mobile/a11y.
9. Cross-service exact-head acceptance.
10. Full regression.
11. Push final heads.
12. Protected CI.
13. Independent reviews.
14. Full end-to-end acceptance.
15. OWNER_REVIEW_GATE.

Parallelize only disjoint files. Serialize Prisma, credit-engine and contract edits.

TEST GATES

SocialOreo:
- prisma generate/validate
- disposable PostgreSQL migration deploy from M1
- migration/race/isolation tests
- onboarding/Post/Watch
- credit hold/finalize/refund/adjustment
- Square sandbox/entitlement/idempotency
- guest/assistant/admin boundaries
- multilingual/RTL
- component/route/browser tests
- portable and real cross-service tests
- full suite, lint, typecheck, production build
- diff, secret and dependency checks

Cross-service:
- valid/wrong credentials
- stale signature
- nonce replay
- query tampering
- wrong workspace/destination
- duplicate request
- timeout/retry/partial failure/restart
- locale preservation
- no duplicate credit/job/occurrence
- clean shutdown

Browser/mobile/a11y:
- landing/demo/signup handoff
- authenticated shell
- onboarding
- Post
- Watch
- credits/checkout
- assistant
- admin
- mobile breakpoints
- keyboard/focus/labels/error announcements
- RTL/zoom/touch targets/reduced motion where relevant

Do not claim browser acceptance without a browser run. If tooling is absent,
inspect whether a lightweight repo-compatible dev test setup can be added. If
required acceptance still cannot be proven, report NOT READY.

CI LOOP

Current run 30877622637 passed only for known head
e1b987c4f1ab672aef807b64ff368ef1b9ec1da2.

After every new push:
- record exact head
- find PR CI run/job IDs
- monitor to completion
- inspect logs on failure
- reproduce and fix without weakening tests
- rerun local gates
- push and monitor the new exact head

Earlier green CI is stale after a new commit.
Do not pipe output through head in a way that hides exit status.
Use bounded timeouts and preserve full logs.

END-TO-END ACCEPTANCE

Run the final exact-head journey:

visitor → landing → $79 offer → free demo → edit/copy → consent → signup/login
→ one workspace → approved profile → sandbox destination → first Post
→ seven-day plan → Post variant → first comment → repost → timezone preview
→ provider-disabled schedule/evidence → Watch exact cost → hold → report/finalize
→ forced failure/refund → saved report → Square sandbox tester checkout
→ exactly-once lifetime entitlement → balances/expiry/ledger → assistant protected
preview/confirmation → admin preview/adjustment/audit → restart/retry → prove no
duplicate workspace, entitlement, grant, charge, hold, finalize, refund, Post
occurrence or Watch run → mobile/keyboard/RTL pass.

Final side-effect counts:
- live provider calls: 0
- real payments: 0
- real publishing: 0
- production mutations: 0
- deployments/DNS changes: 0

DEFINITION OF DONE

READY FOR OWNER REVIEW only when:

- PR #7 contains the wired customer journey, not only libraries.
- No M2 pre-merge finding remains.
- Required CF fixes are completed with a draft CF PR and green CI.
- SocialOreo final exact head has green protected CI.
- Full local regression and migrations pass.
- Real cross-service exact-head acceptance passes.
- Backend/Data/Security Inspector gives GO.
- Product/UI/Journey Inspector gives GO.
- Test/CI/Review Engineer gives GO.
- End-to-end acceptance passes.
- Rollback points are exact.
- PR bodies describe actual final scope.
- All production/provider/payment/publishing counts remain zero.

NOT acceptable:
- UI deferred
- CF fixes tracked later
- library foundation complete
- protected CI unavailable
- ready with caveats
- tests passed before final commit
- local green replacing CI

CONTROLLED SERVER WORKSPACE CLEANUP — AFTER INITIAL STATE VERIFICATION

After PREFLIGHT_AND_SAVERUFLO and REFRESH_REMOTE_STATE have completed, but before
new implementation work, inventory and clean the server workspace safely.

The server currently contains multiple SocialOlla/OpenCode worktrees, temporary
files, old tmux sessions and checkpoint artifacts. Do not delete by name or guess.

Required cleanup sequence:

1. Record the active repositories, worktrees, branches, HEADs, tmux sessions,
   OpenCode processes, LangGraph checkpoint path and files required for rollback.
2. Run and preserve output from:
   - git worktree list --porcelain for each repository;
   - git status --short --branch in every discovered worktree;
   - git branch -vv and remote branch comparison;
   - tmux ls;
   - bounded process listing for opencode, node, python, uvicorn and test servers;
   - disk usage for /home/debian/work, /home/debian/apps and /tmp SocialOlla files.
3. Classify every discovered item as:
   - ACTIVE_M2 — keep;
   - REQUIRED_ROLLBACK — keep;
   - OTHER_ACTIVE_PROJECT — keep and do not touch;
   - STALE_SAFE_TO_REMOVE — removable only with evidence;
   - UNKNOWN — keep and report.
4. The following must be retained:
   - /home/debian/work/SocialOlla-m2;
   - the active SocialOreo M2 branch and PR #7 state;
   - active LangGraph checkpoints for socialolla-m2-revenue-beta;
   - M1 baselines and rollback records;
   - any Content Factory M2 worktree that is created and in use;
   - repositories or worktrees with uncommitted changes;
   - PR #77 checkout/state;
   - any path belonging to another project.
5. Remove only items proven stale and safe, such as:
   - abandoned clean worktrees whose branches are merged or already represented by
     an active retained worktree;
   - obsolete temporary prompt files under /tmp after the GitHub copy is verified;
   - stopped/orphaned test servers and stale sockets owned by this milestone;
   - abandoned tmux sessions after confirming they have no active command or
     uncommitted work;
   - disposable test databases, logs and caches created by completed M1/M2 test
     runs when they are not required as evidence.
6. Use git worktree remove for registered worktrees, never raw rm -rf first.
7. Never remove a dirty worktree, unknown directory, repository root, branch with
   unique unpushed commits, active tmux session or active LangGraph checkpoint.
8. Do not delete remote branches or GitHub artifacts.
9. Write a cleanup manifest with:
   - retained paths and reason;
   - removed paths and evidence;
   - commands used;
   - disk space before/after;
   - rollback or recovery information.
10. Coordinator and Backend/Data/Security Inspector must both approve the cleanup
    plan before deletion. The Test/CI Engineer verifies the active M2 worktree,
    branch, checkpoints and tests still work after cleanup.
11. If any item is uncertain, retain it and continue. Cleanup must never block the
    product work merely to make directories look tidy.

Record the cleanup manifest in the durable checkpoint. Do not commit machine-local
absolute paths or secrets into the product repository.

FINAL REPORT — STOP AT OWNER_REVIEW_GATE

Return:
- exact remote/base/final heads
- PRs and draft states
- LangGraph checkpoint backend/path
- /saveruflo artifacts and hashes
- six real agent assignments
- cleanup manifest: retained/removed/unknown paths and disk before/after
- initial and final finding ledger
- commits per finding
- backend/credit/entitlement/workspace/Post/Watch evidence
- route/UI/public/onboarding/assistant/admin evidence
- multilingual/mobile/a11y/browser evidence
- CF A/B/C evidence
- local test commands/totals
- cross-service evidence
- protected CI run/job IDs on exact final heads
- side-effect counts
- rollback points/runbook
- three independent GO/BLOCK verdicts
- READY FOR OWNER REVIEW or NOT READY
- exact next owner-approved action

Do not mark ready, merge or deploy.
