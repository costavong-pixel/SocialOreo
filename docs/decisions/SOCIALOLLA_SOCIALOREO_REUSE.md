# SocialOlla SocialOreo Reuse Strategy

**Decision date:** 2026-08-03  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Core decision

SocialOlla must also reuse the proven SocialOreo implementation. The merger is not "Content Factory replaces SocialOreo." It is a module-by-module combination in which the strongest working capabilities from both repositories become one product.

Content Factory is the leading source for **Post** foundations. SocialOreo is the leading source for **Watch**, the current customer-facing Next.js application shell, existing Prisma/PostgreSQL structures, and reusable billing/account flows.

The post-PR #4 audit determines the exact technical arrangement and migration sequence. It does not authorize discarding working SocialOreo code merely because Content Factory is more advanced in content operations.

## SocialOreo reuse candidates

The comparative audit should prioritize reuse, adaptation, or compatibility wrapping of SocialOreo capabilities including:

- customer-facing Next.js pages, layouts, routing, responsive components, and product navigation where suitable;
- authentication, user, workspace, session, and ownership foundations that pass isolation review;
- Prisma/PostgreSQL schema and migration infrastructure;
- Watch profile records, saved competitors, snapshots, capture evidence, retries, cancellation, provider-cost estimates, and idempotent snapshot behavior;
- Trend Radar, Competitor Board, audits, reports, and creative-intelligence flows that match the confirmed Watch product;
- Square checkout, payment, account, billing, and entitlement foundations that can be adapted to the new versioned plan and universal-credit design;
- existing plan gates, account settings, billing pages, and customer product flows after removing hard-coded Monthly-only assumptions;
- tests, type checks, lint rules, CI gates, and security checks relevant to retained modules;
- any reusable API routes, services, UI components, and database models confirmed during the exact-main audit.

## Required adaptation

SocialOreo code is reused only after reconciling it with confirmed SocialOlla decisions. Typical changes include:

- replace hard-coded Monthly commercial assumptions with lifetime, monthly, annual, promotional, invite-only, discontinued, and grandfathered plan versions;
- replace fixed Watch limits with admin-configurable entitlements, credits, promotions, and individual overrides;
- expand the initial customer model around one personal workspace while preserving future agency extensibility without exposing agency benefits at launch;
- integrate universal monthly and purchased credit batches with hold, finalize, refund, expiry, and idempotency rules;
- connect the floating unified assistant, notification bridge, support tickets, transcript delivery, and public guest session;
- integrate Post records and delivery evidence from Content Factory without duplicating users, destinations, posts, schedules, or credit charges;
- validate Instagram and TikTok connection, permissions, and destination identity against the canonical account model;
- remove obsolete prototype language, duplicate implementations, unsafe assumptions, and any code that conflicts with current provider capability.

## Combined product responsibility

The intended module split is currently:

```text
SocialOlla customer product
├── Customer shell and shared account flows: SocialOreo candidate
├── Post engine and content operations: Content Factory candidate
├── Watch and competitor/profile intelligence: SocialOreo candidate
├── Billing foundation: SocialOreo candidate, redesigned for versioned plans and credits
├── Unified assistant and support bridge: new shared orchestration over both
├── Canonical identity, entitlements, destinations, credits, and audit: selected during audit
└── Live Instagram/TikTok transports: completed and proven during integration
```

This is a working direction, not permission to couple the repositories blindly. Shared records require explicit contracts, ownership, tests, observability, and rollback.

## Reuse classification rule

Every SocialOreo module must be classified as one of:

- reuse unchanged;
- reuse after configuration changes;
- reuse behind an API or compatibility adapter;
- migrate with behavior-preserving tests;
- retain temporarily during dual run;
- replace because the audit proves incompatibility or unacceptable risk;
- retire because it is obsolete or duplicated.

No module may be rewritten solely because another framework or language is preferred.

## Duplicate-code rule

When both repositories implement similar behavior:

1. compare exact behavior, schema, tests, failure handling, security, and migration cost;
2. select one canonical implementation;
3. retain an adapter only when needed for staged migration;
4. add parity and regression tests;
5. remove the duplicate only after the canonical path and rollback are proven.

The merger must not leave two independent sources of truth for users, workspaces, destinations, posts, publishing status, plans, credits, or Watch snapshots.

## Current audit gate

The exact SocialOreo module map remains gated on:

- PR #4 merging into `main`;
- verification of the exact merged SHA and CI;
- inspection of current routes, schemas, services, tests, billing, Watch, and deployment behavior;
- comparison with Content Factory exact-main and PR #77 state;
- documented migration, dual-run, and rollback costs.

The final architecture may be one repository or cooperating services. Either way, both repositories contribute working code to SocialOlla.