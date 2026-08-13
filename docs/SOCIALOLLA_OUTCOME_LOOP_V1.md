# SocialOlla Outcome Loop v1

**Status:** implemented in the isolated `agent/outcome-loop-v1` branch; not deployed.

## Purpose

Outcome Loop v1 connects an owner-approved content version to the evidence needed to make the *next* plan more deliberate:

```text
approved final version
  -> immutable content snapshot
  -> owner-confirmed manual publication reference
  -> manual post-level metric snapshots
  -> comparative outcome evaluation
  -> pending next-plan recommendation
  -> explicit owner approval or rejection
  -> separate existing draft/schedule action, if the owner chooses
```

It is an evidence and planning feature, not an autonomous agent. Approval of a recommendation never creates a draft, changes a `PostRequest`, schedules content, publishes content, calls a provider, spends a credit, or makes a payment.

## What is recorded

`ContentVersion` is created atomically when a final `PostVariant` is approved and the existing provider-disabled schedule record is written. It copies the title, caption, hashtags, CTA, platform, destination, approval time, and a SHA-256 version hash. The service has no update path for this snapshot; scheduled variants are also no longer editable.

The owner must then manually confirm the external direct post URL and its published time. V1 accepts exact HTTPS host allowlists only:

- Instagram: `instagram.com`, `www.instagram.com`, `m.instagram.com`, with a `/p/`, `/reel/`, or `/tv/` post path.
- TikTok: `tiktok.com`, `www.tiktok.com`, or `vm.tiktok.com`, with a direct post path.
- YouTube: `youtube.com`, `www.youtube.com`, `m.youtube.com`, or `youtu.be`, with a direct watch/short URL.

The URL has query and fragment data removed before it is stored. A profile URL, redirect, generic URL, wildcard/suffix hostname, HTTP URL, or arbitrary host is rejected.

Each `ContentMetricSnapshot` is append-only, marked `MANUAL`, and records a capture time plus visible post-level metrics: views (required), at least one of likes/comments/shares/saves, and optional reach. The service rejects negative, fractional, unsafe, future, pre-publication, and duplicate timestamp values. Account-level Meta Insights data is never silently treated as per-post evidence.

## Evidence threshold and evaluation

The evaluator produces `INSUFFICIENT_EVIDENCE` by default. It creates a recommendation only when all of the following are true:

1. The manual publication is at least 48 hours old.
2. There are at least two snapshots spread across at least 24 hours.
3. The newest snapshot has a positive view count and at least one visible interaction metric.
4. At least three other manually observed published content versions exist for the same workspace, destination, and platform, each with positive views and a visible interaction rate.

It compares the newest post snapshot against the median views and visible-interaction rate of those comparable versions. Recommendations are deliberately phrased as comparative signals, not causal conclusions:

- `KEEP`: both views and interaction rate are above the defined median thresholds.
- `CHANGE`: keep one element and test one deliberate variable.
- `PAUSE`: only available with at least five comparable posts and materially weak results on both measures.

Every ready evaluation carries the evidence scope, numerical comparison, limitations, confidence, and the statement: “Comparative signal only; this does not prove that the content caused the result.”

## Owner approval boundary

Ready evaluations create an `OutcomePlanRecommendation` in `PENDING_APPROVAL`. The owner must explicitly approve or reject it. The decision is an audit record only; its response explicitly reports:

```text
generated: false
scheduled: false
published: false
```

The owner can later start a normal, separate provider-disabled draft and schedule workflow. Outcome Loop V1 does not choose, invoke, or pre-fill that workflow automatically.

## Boundaries

- No live OAuth/provider call, browser automation, worker, cron entrypoint, scheduler, publishing transport, payment, subscription, or database migration execution is added by this feature.
- No existing account-level Insights, public-profile snapshot, competitor Watch, or Audit data is re-labeled as owned-post performance.
- All records are workspace-scoped; the server resolves the workspace from the authenticated database user and never accepts a workspace ID from the client.
- The migration is additive only. It must be reviewed and applied through the existing controlled database-release process; this branch does not apply it.

## Validation focus

The unit tests cover immutable version data, strict direct-post URL pinning, owner confirmation, manual metric validation, insufficient-evidence behavior, `KEEP`/`PAUSE` classification, creation of a pending recommendation, and proof that owner approval does not create a post or schedule slot.
