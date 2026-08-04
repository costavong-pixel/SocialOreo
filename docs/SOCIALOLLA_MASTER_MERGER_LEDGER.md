# SocialOlla Master Merger Ledger

**Project:** Merge Content Factory and SocialOreo into SocialOlla  
**Created:** 2026-08-02  
**Current phase:** M0 — Freeze and inventory  
**Live operations:** Not authorized

## Current checkpoints

| Repository | Branch | SHA | Evidence state |
|---|---|---|---|
| SocialOreo | `main` | `a76d0d70cef124f7e4884ffaf3b04f436b73d06e` | PR #3 merged; PR #4 not merged |
| SocialOreo | `codex/watch-hardening-a76` | `711b2ee49e7a6d162160020b7fce6126c1cae0e7` | Draft PR #4, 10 changed files, Watch hardening only |
| Content Factory | `main` | `e486c7bee4bf2e6687f8c74375b06559c4c1118a` | Phase 10K completion merged |
| Content Factory | `codex/phase-10l-user-safe-wording` | `c3c6866bdd8b7a08dc82fc28ce6fa401d1721d1a` | Draft PR #77; merger audit must evaluate before disposition |

## Phase ledger

| Phase | State | Entry criteria | Exit evidence | Current blocker |
|---|---|---|---|---|
| M0 Freeze and inventory | In progress | Confirm repositories and safe baselines | Tags, SHA inventory, PR/issue export, environment inventory, backup record | Tags/backups/environments not yet recorded |
| M1 Comparative audit | Blocked | SocialOreo PR #4 merged and exact `main` verified | Completed repository comparison and target recommendation | PR #4 remains draft/open |
| M2 Brand/navigation | Not started | Approved comparison | Unified IA/design decision and compatibility plan | M1 |
| M3 Auth/workspace | Not started | Canonical auth/workspace selected | Migration, isolation tests, rollback | M1 |
| M4 Campaign/content/Watch model | Not started | Schema map approved | Reversible migrations and compatibility tests | M1/M3 |
| M5 Unified UI | Not started | Component winners approved | End-to-end provider-free user flow | M2–M4 |
| M6 Delivery/adapters | Not started | Destination and delivery models approved | Multi-destination Instagram/TikTok provider-free and controlled live-test readiness | M4/M5 |
| M7 Media/rendering | Not started | Storage and worker map approved | Media migration and credit-safe generation tests | M4 |
| M8 Billing/plans/credits/admin | Requirements recorded | Canonical account/plan schema approved | Versioned entitlements, credit ledger, admin preview/rollback | M3/M4 |
| M9 Demo/acceptance | Not started | Unified non-live application | Full acceptance, mobile, a11y, isolation, rollback | M2–M8 |
| M10 Staging/domain | Not started | READY FOR SOCIALOLLA STAGING | Staging evidence and cutover/rollback plan | Explicit approval required |
| M11 Final non-live audit | Not started | All safe phases complete | Final readiness verdict | Prior phases |

## 2026-08-02 coordination record

- Verified exact repositories:
  - `costavong-pixel/barnd-ai-content-agent`
  - `costavong-pixel/SocialOreo`
- Verified SocialOreo PR #4 is open, draft, and not merged.
- Verified Content Factory has an open draft PR #77.
- Established SocialOreo as a temporary **documentation coordination home only**.
- Did not select the final merger repository.
- Added the coordinated roadmap index, master roadmap, product decisions,
  repository comparison scaffold, ledger, and migration map.
- Recorded scheduled repost as repeat publishing at a later date/time with a new
  destination delivery occurrence.
- Recorded optional first-comment support as a platform capability that must be
  validated before scheduling.
- No runtime code, schema, provider, payment, production, deployment, or DNS
  behavior changed.

## Confirmed commercial/product overrides

The following newer decisions supersede conflicting older recommendations:

- first customer is an individual user;
- Post and Watch are the two product areas;
- provisional `$79` lifetime launch offer;
- one personal workspace, multiple connected accounts;
- agency capabilities deferred;
- direct Instagram and TikTok publishing must be tested before launch;
- X.com excluded from the base unlimited-channel promise;
- AI titles/captions included;
- image generation and Watch/profile analysis use credits;
- pricing, plans, channels, limits, and credit costs are admin-configurable;
- monthly/annual plans may replace the lifetime offer for new users later;
- purchased entitlements are grandfathered by version.

## Open product decisions

- monthly included-credit amount;
- initial credit-pack prices and sizes;
- fair-use limits for unlimited posting/channels;
- first-comment failure and retry behavior;
- exact launch-channel list beyond Instagram/TikTok;
- X.com connection/payment model;
- advanced Watch products and costs.

## Next exact task

After PR #4 merges:

1. capture merged SocialOreo `main` SHA and CI;
2. capture current Content Factory `main`, PR #77 status, and CI;
3. inspect both repository schemas, routes, auth, workers, tests, billing, and
   deployment boundaries;
4. complete the feature-by-feature comparison;
5. recommend the target repository with migration and rollback evidence;
6. update this ledger before any merger implementation.

## Safety boundary

Not authorized in this phase:

- live OAuth or credentials;
- provider calls or publishing;
- payment charges;
- production data or schema changes;
- deployment or DNS changes;
- destructive repository operations;
- merging the documentation PR without review.
