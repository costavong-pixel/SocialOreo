# SocialOlla Repository Comparison

**Status:** Preliminary evidence only  
**Audit gate:** Complete after SocialOreo PR #4 merges into `main`  
**Rule:** Do not select a final repository or global winner before the audited comparison

## Verified checkpoints

| Repository | Verified `main` | Relevant open PR |
|---|---|---|
| `costavong-pixel/SocialOreo` | `a76d0d70cef124f7e4884ffaf3b04f436b73d06e` | PR #4, draft head `711b2ee49e7a6d162160020b7fce6126c1cae0e7` |
| `costavong-pixel/barnd-ai-content-agent` | `e486c7bee4bf2e6687f8c74375b06559c4c1118a` | PR #77, draft head `c3c6866bdd8b7a08dc82fc28ce6fa401d1721d1a` |

## Preliminary comparison

This table records only facts already supported by repository evidence. “Pending”
means the post-PR #4 audit must inspect code, schemas, tests, and behavior before a
winner or migration strategy is selected.

| Area | Content Factory evidence | SocialOreo evidence | Selection | Required follow-up |
|---|---|---|---|---|
| Application stack | FastAPI/Python application with SQLite-backed operational history and protected admin workflow | Next.js application with Prisma/PostgreSQL development requirements | Pending | Inventory versions, entry points, runtime/deployment requirements, and migration cost |
| Main product strength | Campaign creation, source media, review/approval, previews, delivery states, provider-free adapters, H5 lifecycle | Short-form creative intelligence, audits, Trend Radar, Competitor Board, checkout and saved-competitor Watch path | Pending by module | Confirm reusable UI, auth, billing, Watch, and publishing components |
| Delivery lifecycle | Verified provider-free H5 foundation: idempotency, evidence, retries, timeouts, rate limits, circuit breakers, cancellation, stale recovery, reconciliation | PR #4 adds idempotent Watch snapshot upserts and cancellation checks; no automatic publishing is added by that PR | Content Factory is current delivery-foundation candidate only | Audit whether SocialOreo has other scheduler/publishing code outside PR #4 |
| Platform contracts | Provider-free contracts for Instagram, Facebook, Threads, Google Business Profile, LinkedIn, TikTok, YouTube, Pinterest, X, and Reddit; live transports are not implied | Current verified README focuses on creative intelligence and competitor reporting | Content Factory contract layer is current candidate | Audit adapter schemas against SocialOlla direct Instagram/TikTok and multi-destination requirements |
| Instagram groundwork | Mocked OAuth, vault, token, identity, container/publication, and delivery groundwork; live operations disabled | Pending audit | Content Factory candidate | Verify current main and PR #77 do not weaken the boundary |
| TikTok groundwork | Provider-free contract exists; live transport not yet proven | Pending audit | Pending | Identify SocialOreo destination and posting support, if any |
| Watch / competitor analysis | Not identified as primary implementation in current audit evidence | Saved-competitor Watch path; PR #4 requires ownership, explicit opt-in, bounded entitlement, max three competitors, weekly/fortnightly cadence, capture evidence, cost estimates, cancellation, retries, and idempotent snapshots | SocialOreo is current Watch candidate | Re-audit merged main and reconcile hard-coded plan limits with admin-configurable product rules |
| Billing | Existing Content Factory evidence is not the canonical customer billing system | Square hosted checkout and Monthly plan logic exist in merged PRs #1–#3 | SocialOreo billing is a reusable candidate, not canonical design | Replace hard-coded Monthly assumptions with versioned plans, credits, grandfathering, and admin controls |
| Credit ledger | Pending audit | Pending audit | Pending | Find existing balance/ledger tables and evaluate against hold/finalize/refund requirements |
| Workspace isolation | Business/workspace-scoped protected workflows are repeatedly tested | PR #4 requires workspace ownership for Watch | Pending canonical model | Compare user, workspace, business, brand, destination, and role schemas |
| Individual vs agency model | Historical Content Factory is multi-brand/private workflow oriented | SocialOreo product model pending audit | Product decision controls | Initial plan is one individual workspace; agency/multi-workspace features remain future-compatible but disabled |
| Campaign/content UI | Phase 10 dashboard, navigation, wizard, review studio, platform previews, connections, delivery operations, mobile/accessibility evidence | Next.js user-facing experience pending audit | Pending feature-by-feature | Compare screens, routes, responsiveness, terminology, and test coverage |
| Admin Pricing & Features | Pending audit | Pending audit | Missing until proven | Design versioned, previewable, rollback-safe control plane |
| Storage/media | R2 direction and existing media domain are operational dependencies | Pending audit | Pending | Map object storage, local assets, media metadata, fingerprints, and retention |
| Database migration | SQLite operational history | Prisma/PostgreSQL schema and migrations | Pending | Decide target database only after schema comparison and migration rehearsal |
| Tests/CI | Hundreds of tests and OVH self-hosted CI evidence | Current PR evidence includes Prisma validation, tests, typecheck, lint, build, and security scans | Preserve both relevant suites | Create unified acceptance matrix and exact-head merge gates |
| Deployment | Existing VPS/RSS/feed/media dependencies must be preserved until migration | Public snapshot intentionally omits deployment configuration | Pending | Inventory real environments without exposing secrets |

## Required post-PR #4 audit sections

For each repository, inspect and record:

1. entry points and framework versions;
2. route and page inventory;
3. authentication/session model;
4. user/workspace/brand/destination schema;
5. campaign, post, asset, schedule, repost, and first-comment models;
6. queue, worker, delivery, retry, reconciliation, and evidence behavior;
7. Instagram and TikTok adapter capability;
8. Watch provider, snapshot, analysis, and cost behavior;
9. billing, plan, entitlement, credit, and refund behavior;
10. admin controls;
11. storage and media pipeline;
12. tests, CI, deployment, rollback, and secrets boundaries;
13. obsolete, duplicated, copied, or risky code;
14. licensing and public/private repository exposure.

## Selection record template

Complete one row for every feature before implementation:

| Feature | Content Factory | SocialOreo | Selected source | Why | Migration method | Compatibility risk | Tests | Rollback |
|---|---|---|---|---|---|---|---|---|
| Example: delivery state machine | pending audit | pending audit | pending | pending | pending | pending | pending | pending |

## Audit stop condition

Do not recommend a final target repository until:

- PR #4 is merged;
- exact merged `main` and CI are verified;
- both schemas and application entry points are inspected;
- the feature table is complete;
- migration and rollback costs are documented;
- product-decision conflicts are identified.
