# SocialOlla Roadmap Index

**Project:** SocialOlla  
**Current coordination date:** 2026-08-27  
**Repository:** `costavong-pixel/SocialOreo`

## Current authority

For active implementation scheduling and outstanding work, start with:

1. **`SOCIALOLLA_CURRENT_EXECUTION_PLAN.md`** — current release identities, outstanding implementation phases, evidence rules, provider status, final acceptance, and final security gate.
2. **`decisions/SOCIALOLLA_SESSION_SECURITY_LOG.md`** — persistent Auth0 session audit decision for security playbooks/incident response.
3. `SOCIALOLLA_PRODUCT_DECISIONS.md` — owner-confirmed product decisions.
4. `SOCIALOLLA_M2_COMPLETION_LEDGER.md` and other completion ledgers — historical implementation evidence.
5. `SOCIALOLLA_MASTER_ROADMAP.md`, repository comparison, merger map, and merger ledgers — historical merger planning/provenance.
6. Exact repository code, migrations, tests, CI, deployment identity, provider receipts, DB evidence, and owner screenshots — implementation truth.

A newer verified runtime/provider result supersedes an older checkpoint. A newer product decision supersedes an older commercial recommendation, but never silently overrides security, ownership, delivery-evidence, rollback, migration, or production-approval requirements.

## Current implementation checkpoint

At the latest preserved completion checkpoint recorded in the current execution plan:

- GitHub `main`: `467b39e6870e60d3a2cb21e208000af782d86231`
- Last committed completion candidate: `3942075b3915159b50c903a0565b1ccc97861ba6`
- Staging runtime: `12fde638c5d4d641390a94e0480ade005f3389f9`
- Recovered Post/Watch work preserved separately at `1895e2b4a22dbe9a43e3f54a2b2749551c2235b5`
- Newer provider-boundary/workspace/reconciliation edits existed after `3942075...` but were not yet preserved as a durable SHA at the last pause.
- Production effects: zero.
- Real payments: zero.

Do not treat the staging SHA, candidate SHA, and GitHub main SHA as interchangeable.

## Product structure

The canonical SocialOlla customer shell is:

**Dashboard · Post · Watch · Calendar · Connections · Credits · Analysis · Assistant · Settings**

Profile/account context is available from the account menu. ADMIN uses the same product shell with additional authorized Admin access rather than a separate product generation.

Post and Watch are separate flagship features:

- **Post** — create, adapt, attach media, choose destinations, publish now/schedule, run durable delivery jobs, capture provider receipts/status, retry/reconcile, and surface customer history.
- **Watch** — choose a monitored profile, schedule repeated captures, reserve credits, run a real provider automatically, persist evidence/deltas, settle/refund credits exactly once, and surface history/results.

Analysis preserves useful historical audit/profile-analysis capability under the canonical SocialOlla shell.

## Current high-level phase sequence

The detailed gates live in `SOCIALOLLA_CURRENT_EXECUTION_PLAN.md`. The default sequence is:

1. Preserve one exact candidate SHA.
2. Deploy/accept that exact staging release for USER, ADMIN, Profile, Home, navigation, and owner-visible UI.
3. Finish real Meta/Instagram OAuth and real Instagram Post.
4. Install/prove the Post worker.
5. Finish real Watch provider execution.
6. Install/prove the Watch worker.
7. Establish one canonical credit authority.
8. Establish one canonical entitlement authority.
9. Finish Content Factory authenticated integration.
10. Finish Square sandbox checkout/webhook/refund lifecycle.
11. Implement remaining connected social providers through shared adapter contracts.
12. Neutralize conflicting legacy execution/write paths without destroying historical evidence.
13. Run final exact-release customer/visual acceptance.
14. Run the final full security/dependency release gate against the finished application.

The broad final security pass is intentionally deferred until functional completion per owner direction; targeted security controls remain part of implementation where a feature boundary requires them.

## Current social-provider reality

| Platform | Current state |
|---|---|
| Instagram | Partial; auth/token/publishing code exists, real OAuth/publish/Watch acceptance outstanding |
| Facebook Pages | Not implemented as a real connected provider |
| TikTok | Public/read/audit capability only; no connected publishing OAuth/token path proven |
| Pinterest | Not implemented |
| LinkedIn | Not implemented |
| X/Twitter | Not implemented |
| YouTube | Trend/audit references only; no connected publishing flow proven |
| Threads | Not implemented |

Do not advertise all-platform support until each advertised provider has real-provider acceptance evidence.

## Evidence rules

- HTTP 200 is not customer acceptance.
- UI-only/provider-disabled code is not a real integration.
- A worker script is not an installed/running worker.
- Real provider features require provider-side effect plus customer-visible result.
- Previously passed evidence remains valid unless a relevant later diff invalidates it; use delta/change-impact verification instead of restarting every checkpoint.
- Owner screenshots/visual inspection are required final evidence for customer-visible flows.
- Production changes and real payments require explicit production approval.
- Autonomous workers cannot self-approve production gates.

## Session security logging

The current roadmap includes persistent, privacy-minimized Auth0 session evidence using the existing `AuditEvent` store. See `decisions/SOCIALOLLA_SESSION_SECURITY_LOG.md` for event semantics, prohibited sensitive data, correlation strategy, failure behavior, and final security-playbook acceptance.

## Historical merger documents

Older documents in this directory describe the earlier SocialOreo + Content Factory merger phase. They remain provenance, but stale phase tables such as "M2 not started" must not be used as current product status when contradicted by the current execution plan and repository/runtime evidence.
