# SocialOlla M2 — Completion Ledger

Status: OPEN (completion loop in progress)
Inspectors: Backend/Data/Security GO (with conditions); Product/UI/Journey BLOCK (journey unwired)
Cleanup: cf-m2insB removed (approved by backend inspector + coordinator); manifest recorded in LangGraph checkpoint.

## Backend/Data/Security findings
- DATA-01 [BLOCKER before real-money]: settlement grant not atomic with payment claim (grant uses module prisma, not txn client) -> must thread transaction client into entitlement-service.
- DATA-02: watch failure path updateMany un-scoped (marks all RUNNING FAILED) -> scope to report.id.
- DATA-03: confirmProfile upsert key never matches -> duplicate Profile rows -> fix to canonical external key.
- DATA-04 [info]: ensureMonthlyBatch has no production caller; monthly feature unwired -> wire a grant-time monthly batch for lifetime entitlement.
- DATA-05: PostRequest.intentKey raw/un-hashed + duplicate 500 -> use canonical intentKey + P2002 recovery.
- DATA-10: no concurrent workspace first-access test -> add.
- SECURITY-01: M2 actions take authUserId param -> when wired, must derive from verified session server-side.
- SECURITY-02: adminSetLifetimePriceCents lacks admin guard -> add.
- Reconc/rollback runbook: materialize docs/...rollback runbook.

## Product/UI/Journey findings
- UI-01/02/03/07: landing + metadata + branding -> Post-first SocialOlla rewrite.
- UI-05/06: pricing plansResolved dead-code + CTA -> /audits/new -> fix to render canonical $79 + CTA to demo/checkout.
- UI-08: /demo route missing.
- UI-09/10/11/12/13/14/15: onboarding, connections, posts, watch, credits, assistant, admin routes missing.
- UI-16/17/18: shell nav + dashboard + product-frame -> M2 shell.
- UI-04/19: layout lang/dir/RTL + language selector + states.
- JOURNEY-01..09: wiring + ScheduleSlot model + browser E2E.
- TEST: install @playwright/test + chromium; add browser E2E for the journey.

## Content Factory (change gate TRIGGERED)
- CF-A: candidates_json shape inconsistent. CF-B: query not in HMAC. CF-C: staged cap 10.
- Worktree /home/debian/work/SocialOlla-m2-post, branch milestone/socialolla-m2-post-beta, one draft PR, PR #77 untouched.
