# SocialOlla Product Decisions

**Project:** SocialOlla  
**Updated:** 2026-08-02  
**Status:** Confirmed product requirements; update when Costa confirms a change

## Decision authority

This file records direct product decisions. When it conflicts with an older
commercial recommendation in the Master Merger Plan, this file controls. Security,
isolation, evidence, rollback, and migration safeguards remain mandatory.

## 1. Product structure

- SocialOlla has two product areas: **Post** and **Watch**.
- The first customer is a regular individual user.
- The individual plan has one login and one personal workspace.
- Users may connect multiple social accounts inside that workspace.
- Multiple brand workspaces, team members, client workspaces, and agency controls
  are future agency-plan features.
- Users may give every connected social account a custom label.

## 2. Post package direction

- Provisional launch price is `$79` lifetime.
- Pricing and included features remain adjustable from the admin dashboard before
  launch.
- Existing customers retain the version of the entitlement promised when they
  purchased.
- The lifetime offer may later close to new customers and be replaced with
  monthly or annual plans.
- AI-generated titles and captions are included.
- Image generation and Watch/profile analysis are credit-based.
- Unlimited publishing and supported channels are intended for the lifetime plan,
  except X.com, subject to configurable fair-use and anti-abuse controls.
- X.com is excluded from the base package because its publishing/API cost may
  create continuing provider expense.

## 3. Publishing and scheduling

- Direct publishing must be tested before launch.
- Instagram and TikTok are the first required direct-publishing platforms.
- The architecture must support multiple connected accounts per user.
- One post may publish to multiple connected accounts at the same time.
- Every selected destination receives its own delivery job, status, evidence,
  retry history, and result.
- Platform-specific titles, captions, placement options, and warnings must be
  supported when required.
- Draft/export is a fallback when direct publishing is unavailable or fails.

### Scheduled repost

- “Repost” means publishing the same content again at a later scheduled date/time.
- Each scheduled repost is a new delivery occurrence linked to the source content.
- It must have its own schedule, destination validation, idempotency key, delivery
  job, evidence, and retry history.
- Editing a future repost must not silently change an already-published occurrence.
- The launch meaning is scheduled repeat publishing, not a platform-native
  reshare/repost action.

### First comment and scheduled comment threads

- A post may include an optional first comment.
- The first comment may vary by destination/platform.
- SocialOlla must show whether the selected platform/API supports first comments
  before scheduling.
- Unsupported first-comment intent must be blocked or clearly removed with user
  confirmation; it may not be silently ignored.
- Main-post delivery and first-comment delivery are separate operations linked to
  the same destination occurrence.
- A successfully published main post remains published when its optional first
  comment fails.
- SocialOlla retries only the failed first-comment operation; it must not republish
  or duplicate the main post.
- The first comment uses its own idempotency key, status, retry count, provider
  reference, timestamps, evidence, and terminal failure reason.
- The destination result must distinguish `post published / first comment pending`,
  `post published / first comment failed`, and full success.
- Users must be able to retry or cancel a pending first comment without changing
  the published main post.
- The default automatic retry limit is three attempts.
- The admin dashboard controls retry count, retry delays, backoff policy, terminal
  timeout, and whether manual retry remains available.
- System/provider retry attempts do not create additional credit charges for the
  same confirmed comment action.
- The admin dashboard controls the number of comment actions included by plan,
  billing cycle, promotion, or individual-user override.
- Comment actions may be configured as free, included within a plan allowance,
  paid with universal credits, or temporarily covered by promotional credits.
- The admin dashboard controls credit cost per comment action, free-comment quota,
  promotional quantity, promotion start/end dates, and excess-usage behavior.
- When the selected platform/API permits threaded replies, users may create a
  scheduled multi-comment thread beneath the post.
- The first scheduled comment attaches to the published post. Each later comment
  replies beneath the first comment or the prior thread item according to the
  selected thread structure and provider capability.
- Every thread item has its own text, schedule offset or exact time, destination,
  parent reference, idempotency key, status, retry record, provider reference,
  evidence, credit treatment, and terminal failure reason.
- A failed later thread item does not delete, republish, or duplicate the main post
  or earlier successful comments.
- By default, later dependent comments pause when their required parent comment
  has not published successfully; the user may retry the parent or cancel the
  remaining thread.
- The admin dashboard controls the maximum comments per thread, minimum and
  maximum delay between comments, included/free quantity, credit cost per item or
  per thread, promotion rules, and individual-user overrides.
- Platform/API capability remains the hard limit: admin settings may restrict a
  supported capability but may not claim or enable a provider action that the
  platform does not support.

## 4. Basic Profile Analysis

A Basic Profile Analysis includes:

- profile name;
- biography;
- profile image;
- public links;
- follower count;
- following count;
- total post count;
- posting frequency;
- main content topics;
- formats used;
- average public likes, comments, and views when available;
- top three recent posts;
- basic engagement-rate estimate;
- three strengths;
- three improvement opportunities;
- recommended content direction.

It excludes advanced audience demographics, long-term history, continuous
monitoring, detailed multi-profile comparison, and agency reporting unless those
are separately enabled and priced.

## 5. Credit system

- The exact monthly included-credit amount is not decided.
- The admin dashboard must control the monthly allowance.
- Monthly credits are granted immediately when a qualifying plan activates.
- Monthly credits reset on each user’s signup-anniversary date.
- Unused monthly credits expire at the reset.
- A monthly allowance change applies to an existing user at the next reset, not
  during the current cycle.
- Purchased credits may be bought at any time.
- Purchased credits are universal across image generation, Basic Profile
  Analysis, Watch, comment automation, and future credit-based features.
- Purchased credit batches remain valid for 12 months from purchase.
- Purchased credits are non-refundable for cash.
- Purchased credits are non-transferable and remain with the purchasing account.
- Users may buy preset packs and may also enter a custom credit amount.
- Larger packs may use a lower price per credit.
- Pack sizes, prices, discounts, minimums, maximums, and promotions are controlled
  from the admin dashboard.
- Monthly expiring credits are spent first.
- Purchased batches are then spent by earliest expiration first.
- Refunds should return to the original credit source when possible.

## 6. Credit confirmation, charging, and failure policy

- Before a credit-based action runs, show the exact credit cost and require user
  confirmation.
- Credits are held before processing and finalized after processing.
- Provider or system failures automatically refund credits.
- Batch actions charge only for completed, independently usable items.
- Failed batch items are refunded automatically.
- Single reports and combined comparisons are all-or-nothing.
- Every credit operation uses an idempotent job ID to prevent duplicate charges.
- The ledger records credits held, charged, refunded, original source, failure
  reason, and provider-cost estimate.
- Automatic retries for one confirmed action reuse the original hold/idempotency
  scope and cannot charge the user again.
- A scheduled comment thread must show its pricing basis before confirmation:
  per-comment, per-thread, included allowance, free promotion, or mixed pricing.
- When charging per comment, only independently delivered comment items are
  finalized; failed undelivered items are refunded automatically.

Examples:

- Four images requested, three delivered: charge three image units and refund one.
- Three separate profile reports requested, two delivered: charge two and refund
  one.
- One combined comparison fails to include a required profile: refund the whole
  comparison unless the user explicitly accepts a revised lower-cost scope.
- One paid first comment fails twice and succeeds on the third attempt: charge the
  original comment cost once, not three times.
- One paid first comment reaches terminal failure: return the held credits to the
  original monthly, purchased, or promotional source.
- Five scheduled comment items are confirmed and four publish: charge four items
  under per-comment pricing and refund the failed item.

## 7. Admin Pricing & Features control plane

The admin dashboard must control:

- plan name, price, currency, sale price, and availability;
- lifetime, monthly, annual, promotional, hidden, invite-only, and discontinued
  plans;
- included features and social channels;
- direct publishing, draft/export, or disabled state per channel;
- posting and connected-account limits;
- fair-use and anti-abuse limits;
- AI-title and AI-caption inclusion;
- monthly included credits;
- credit cost per action;
- credit reset and expiration rules;
- image-generation models and costs;
- Basic/advanced analysis and Watch features;
- first-comment and scheduled-comment-thread enablement;
- maximum comments per thread, timing limits, dependency behavior, quotas, retry
  policy, and credit pricing;
- free and promotional comment allowances with effective dates;
- X.com as excluded, add-on, credit-based, or bring-your-own;
- credit packs, custom purchase, discounts, and promotions;
- provider selection and outage controls;
- global defaults and individual-user overrides;
- manual credit additions, removals, and refunds;
- grandfathered entitlement versions;
- usage, provider cost, publishing failures, and audit logs.

Pricing/feature changes require:

1. draft configuration;
2. old-versus-new preview;
3. affected-plan/user summary;
4. grandfathering impact;
5. effective date/time;
6. provider-cost impact estimate;
7. final confirmation;
8. version history and rollback.

## 8. Grandfathering and future plans

- Existing lifetime customers remain on the entitlement version promised at
  purchase.
- Future monthly and annual plans apply to new customers unless an existing user
  voluntarily buys an add-on or upgrades.
- Entirely new provider-cost features, higher limits, team features, agency
  features, and premium services may be separate add-ons without removing the
  original purchased entitlement.

## 9. Decisions still open

- Exact monthly included-credit amount.
- Launch credit-pack sizes and prices.
- Exact fair-use thresholds for “unlimited” posts and connected channels.
- Default maximum scheduled comments per thread and default delay rules.
- Final list of supported launch channels beyond Instagram and TikTok.
- X.com connector model.
- Exact advanced Watch products and credit costs.
