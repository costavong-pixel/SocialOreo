# SocialOlla Master Roadmap

**Derived from:** SocialOlla Master Merger Plan dated 2026-08-01  
**Updated with confirmed product decisions:** 2026-08-02  
**Repositories:** `costavong-pixel/barnd-ai-content-agent` and `costavong-pixel/SocialOreo`

## 1. Objective

Merge the strongest verified parts of Content Factory and SocialOreo into one
secure, mobile-friendly product named **SocialOlla**.

SocialOlla has two product areas:

- **Post** — AI-assisted content creation, review, scheduling, direct publishing,
  repeat publishing, first comments, and delivery tracking.
- **Watch** — credit-based public profile and competitor analysis.

The merger must produce one user-facing application, one authentication and
workspace model, one destination model, one content lifecycle, one delivery
lifecycle, one billing/credit system, one admin control plane, and one deployment
strategy.

## 2. Launch customer and commercial direction

The first customer is an individual user, not an agency account.

Initial package direction:

- provisional `$79` lifetime offer;
- one individual login and one personal workspace;
- multiple connected social accounts inside that workspace;
- unlimited posting and supported channels, except X.com, subject to configurable
  fair-use and anti-abuse controls;
- AI-generated titles and captions included;
- image generation and Watch/profile analysis use credits;
- pricing and features remain configurable until launch;
- existing buyers retain the entitlement version promised at purchase;
- monthly and annual plans may replace the lifetime offer for new customers after
  sufficient traction.

Agency, team, client, shared-workspace, and multiple-brand-workspace features are
future plan capabilities.

## 3. Canonical Post workflow

The launch Post workflow must support:

1. create or select content;
2. select multiple connected destination accounts;
3. customize platform-specific titles, captions, and first comments when needed;
4. preview the exact credit-free and credit-based actions;
5. approve and schedule;
6. create an independent delivery job for every destination;
7. publish directly to Instagram and TikTok before launch;
8. record request fingerprint, provider reference, timestamps, status, retries,
   and evidence;
9. show destination-specific success or failure;
10. optionally schedule the same content to publish again at a later date/time.

A scheduled repost is a new delivery occurrence linked to the original content.
It must have its own schedule, destination validation, idempotency key, delivery
job, evidence, and retry history. It is not treated as a platform-native reshare
unless a future adapter explicitly supports that action.

The optional first comment must be destination-specific and must only be attempted
where the platform/API supports it. Unsupported capability must be shown before
scheduling and may not be silently ignored.

## 4. Canonical delivery lifecycle

Use the strongest verified Content Factory H5 concepts:

```text
idea
→ generated
→ under_review
→ approved
→ rendered
→ scheduled
→ queued
→ sending
→ sent
→ reconciled
→ posted
```

Failure and control states include:

```text
failed
retry_pending
cancelled
posted_unverified
```

Rules:

- approval is not publishing;
- scheduling is not publishing;
- queued is not sent;
- sent is not posted;
- posted requires valid evidence;
- each destination is isolated;
- duplicate suppression is mandatory;
- retries, timeout, rate-limit handling, circuit breakers, cancellation, stale
  claim recovery, reconciliation, and audit transitions are required;
- one destination failure must not falsely mark another destination failed or
  successful.

## 5. Watch and Basic Profile Analysis

Watch uses Bright Data and competing public-social-data providers behind a
provider abstraction. Provider selection and feature cost must be configurable.

A Basic Profile Analysis includes:

- profile name, biography, profile image, and public links;
- followers, following, and total post count;
- posting frequency and main content topics;
- format use;
- average public likes, comments, and views when available;
- top three recent posts;
- a basic engagement-rate estimate;
- three strengths;
- three improvement opportunities;
- a short recommended content direction.

It excludes advanced audience demographics, long-term history, continuous
monitoring, detailed multi-profile comparison, and agency reporting unless those
are separately enabled and priced.

## 6. Credit architecture

The credit system must be server-authoritative and ledger-based.

Required behavior:

- monthly allowance is admin-configurable and not hard-coded;
- monthly credits are granted immediately when a qualifying plan activates;
- reset occurs on each user's signup-anniversary date;
- unused monthly credits expire at the next reset;
- allowance changes apply at the next reset;
- purchased credits are universal across credit-based features;
- purchased credits may be bought at any time;
- purchased batches expire 12 months after purchase;
- purchased credits are non-refundable for cash and non-transferable;
- monthly credits are spent first;
- purchased batches are spent by earliest expiration first;
- refunds return to the original source when possible.

Before a credit-based action:

1. show the exact cost;
2. require confirmation;
3. hold the credits;
4. execute with an idempotent job ID;
5. finalize successful charges;
6. automatically refund provider/system failures.

Batch actions charge only for independently usable successful items. Single
reports and combined comparisons are all-or-nothing.

## 7. Admin control plane

The admin dashboard must control product behavior without code deployment.

Required configuration areas:

- plan names, prices, currencies, availability, sale pricing, and effective dates;
- lifetime, monthly, annual, promotional, hidden, invite-only, and discontinued
  plans;
- feature flags and channel availability;
- direct publish, draft/export, or disabled state per channel;
- posting, connection, fair-use, and anti-abuse limits;
- AI title/caption inclusion;
- monthly credit allowance and reset rules;
- credit price per action;
- image models and costs;
- Basic/advanced profile analysis and Watch features;
- X.com as excluded, add-on, credit-based, or bring-your-own;
- preset and custom credit pack pricing;
- global defaults and individual overrides;
- manual credits/refunds;
- promotions and coupons;
- grandfathered entitlement versions;
- provider outage controls;
- usage, provider cost, publishing failures, and audit logs.

Every pricing/feature change requires draft, preview, impact summary,
confirmation, scheduled activation option, version history, and rollback.

## 8. Repository strategy

Do not select a final target repository before the post-PR #4 comparative audit.
Do not copy both repositories together.

For every major feature, record:

- Content Factory implementation;
- SocialOreo implementation;
- selected winner;
- migration method;
- compatibility risk;
- required tests;
- rollback path.

Preserve both original repositories and create reversible merger branches.

## 9. Merger phases

### M0 — Freeze and inventory

- capture exact default-branch SHAs;
- export open PRs/issues;
- record deployment environments and variable names without values;
- tag safe baselines;
- back up databases and operational dependencies;
- stop unrelated refactors that conflict with the merger.

### M1 — Comparative audit

Complete `SOCIALOLLA_REPOSITORY_COMPARISON.md` after SocialOreo PR #4 merges.
No global winner is allowed; choose module by module.

### M2 — Brand and navigation

Introduce SocialOlla naming, design tokens, unified navigation, plain-language
statuses, and compatibility redirects.

### M3 — Authentication and workspace

Select canonical auth, migrate users safely, enforce one personal workspace for
the initial individual plan, preserve isolation, and keep future agency roles
extensible but disabled.

### M4 — Campaign, content, and Watch data

Map campaigns, posts, assets, destinations, approval states, schedules, repost
links, first comments, Watch profiles, snapshots, and evidence. Preserve identity
and timestamps.

### M5 — Unified UI

Combine the strongest dashboard, creation flow, editor, calendar, connection
management, delivery monitoring, Watch experience, billing, and admin controls.

### M6 — Delivery and platform adapters

Preserve H5 foundations, add an adapter registry, implement direct Instagram and
TikTok publishing/testing, validate multiple destination jobs, and prevent
unsupported intent.

### M7 — Media and rendering

Preserve safe object storage and source fingerprints. Integrate image generation
through credit accounting. Prefer low-cost deterministic transformations before
premium generation.

### M8 — Billing, plans, credits, and entitlements

Implement versioned plans, admin-configurable features, credit ledger, purchase
packs, expiry, failure refunds, grandfathering, and provider-cost reporting.
Existing hard-coded monthly assumptions must not become the new canonical model.

### M9 — Demo and acceptance

Run an end-to-end non-live demo and acceptance suite including mobile,
accessibility, isolation, duplicate prevention, migration verification, credit
failure/refund behavior, and rollback.

### M10 — Staging and domain readiness

Prepare staging, OAuth callback domains, media/feed compatibility, smoke tests,
and rollback. No deployment or DNS cutover without explicit approval.

### M11 — Final non-live audit

Produce a final verdict:

```text
READY FOR SOCIALOLLA STAGING
```

or

```text
NOT READY — FIXES REQUIRED
```

## 10. Safety boundary

Without explicit current approval, do not:

- use real OAuth credentials;
- call live providers;
- publish real content;
- charge a payment method;
- mutate production data;
- deploy;
- change DNS;
- delete either repository;
- claim a provider capability that has not been verified.

## 11. First required execution gate

The next audit begins only after SocialOreo PR #4 is merged into `main`.
At that point:

1. verify the exact merged SHA and CI;
2. inventory both repository heads;
3. reconstruct current state from code, migrations, tests, PR evidence, and this
   roadmap;
4. complete the comparison and migration map;
5. return one target-repository recommendation with evidence and rollback impact.
