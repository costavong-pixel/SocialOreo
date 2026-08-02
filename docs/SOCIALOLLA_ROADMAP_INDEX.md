# SocialOlla Roadmap Index

**Project:** SocialOlla  
**Coordination date:** 2026-08-02  
**Status:** Documentation-only coordination baseline  
**Final merger repository:** Not selected; selection requires the comparative audit

## Purpose

This directory coordinates the merger of:

- `costavong-pixel/barnd-ai-content-agent` — Content Factory
- `costavong-pixel/SocialOreo` — SocialOreo

The documents here organize product decisions, repository evidence, merger phases,
and migration work in one place. Keeping the coordination documents in this
repository does **not** mean SocialOreo has been selected as the final target
codebase.

## Authority order

When requirements conflict, use this order:

1. `SOCIALOLLA_PRODUCT_DECISIONS.md` — decisions confirmed directly by Costa.
2. `SOCIALOLLA_MASTER_ROADMAP.md` — architecture and merger sequence derived from
   the 2026-08-01 Master Merger Plan.
3. `SOCIALOLLA_REPOSITORY_COMPARISON.md` — verified feature-by-feature evidence.
4. `SOCIALOLLA_MASTER_MERGER_LEDGER.md` — current phase, SHAs, PRs, gates, and
   blockers.
5. `SOCIALOLLA_MIGRATION_MAP.md` — approved source-to-target data and module map.
6. Repository code, migrations, tests, CI, and deployment evidence.

A newer confirmed product decision supersedes an older commercial recommendation
in the Master Merger Plan. It does not automatically override security,
isolation, delivery-evidence, rollback, or migration requirements.

## Current repository checkpoints

| Repository | Verified `main` | Current relevant work | Coordination interpretation |
|---|---|---|---|
| SocialOreo | `a76d0d70cef124f7e4884ffaf3b04f436b73d06e` | Draft PR #4, `711b2ee49e7a6d162160020b7fce6126c1cae0e7`, hardens saved-competitor Watch | Post-PR #4 audit is blocked until the PR is merged and new `main` is verified |
| Content Factory | `e486c7bee4bf2e6687f8c74375b06559c4c1118a` | Draft PR #77, Phase 10L wording/lifecycle clarity | Preserve and evaluate in the merger comparison; no automatic merge decision |

## Product structure

SocialOlla has two user-facing product areas:

- **Post** — create, review, schedule, publish, repeat, and track social content.
- **Watch** — analyze public profiles and competitor activity using credit-based
  provider work.

The launch customer is an individual user with one personal workspace. Agency,
team, client, multi-brand-workspace, and shared-workspace capabilities are future
plans.

## Roadmap phase status

| Phase | Status | Current gate |
|---|---|---|
| M0 — Freeze and inventory | In progress | Repository names and current SHAs captured; tags, environment inventory, backups, and open-item export remain |
| M1 — Comparative audit | Blocked | Start only after SocialOreo PR #4 merges into `main` and exact merged SHA is verified |
| M2 — Brand and navigation | Not started | Requires M1 module decisions |
| M3 — Authentication and workspace | Not started | Requires canonical auth/workspace decision |
| M4 — Campaign and content model | Not started | Requires schema comparison and migration map |
| M5 — Unified UI | Not started | Requires selected components and navigation map |
| M6 — Delivery and platform adapters | Not started | Preserve H5 lifecycle and validate direct Instagram/TikTok requirements |
| M7 — Media and rendering | Not started | Requires storage and worker migration decisions |
| M8 — Billing, plans, credits, and admin controls | Requirements in progress | Product rules are recorded; implementation comparison remains |
| M9 — Demo and acceptance | Not started | Requires unified non-live workflow |
| M10 — Staging and domain readiness | Not started | Explicit approval required before deployment or DNS work |
| M11 — Final non-live audit | Not started | Must end READY FOR SOCIALOLLA STAGING or NOT READY — FIXES REQUIRED |

## Coordination rules

- Do not merge the repositories by copying all files.
- Do not select a global winner. Select the strongest implementation per feature.
- Do not treat provider-free contracts as live provider integrations.
- Do not perform real OAuth, provider calls, publishing, billing charges,
  production migration, deployment, or DNS work without explicit current approval.
- Do not remove either source repository during the merger.
- Every meaningful product decision must be added to
  `SOCIALOLLA_PRODUCT_DECISIONS.md` and referenced in the merger ledger.
- Every code phase must record exact base/head SHAs, tests, CI, migration impact,
  rollback, and unresolved blockers.
- A post may target multiple connected accounts, but every destination receives
  an independent delivery job and evidence trail.

## Immediate sequence

1. Complete and merge SocialOreo PR #4 through its normal review and CI gates.
2. Capture the new exact SocialOreo `main` SHA.
3. Refresh Content Factory `main`, open PRs, and existing audit artifacts.
4. Complete `SOCIALOLLA_REPOSITORY_COMPARISON.md` feature by feature.
5. Select the final target repository only after the comparison is approved.
6. Convert the approved comparison into small, reversible merger PRs.

## Commercial focus

The revenue-first path is:

1. sell the configurable individual Post package;
2. include AI titles and captions;
3. use credits for image generation and Watch/profile analysis;
4. sell universal credit packs;
5. introduce monthly and annual plans for new users after traction;
6. preserve promised entitlements for existing lifetime-plan versions;
7. reserve agency/team/multi-workspace capabilities for a future higher-value plan.
