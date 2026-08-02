# SocialOlla AI Engagement Scope

**Decision date:** 2026-08-02  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Initial advanced feature

The first AI engagement automation scope is **inbound only**:

- generate or send replies to incoming public comments where supported;
- generate or send replies to incoming direct messages where supported;
- charge through universal credits, plan allowances, free trials, or promotional credits;
- require a confirmed daily or monthly credit budget before an ongoing rule starts;
- stop automatically when credits, budget, permissions, provider capability, messaging windows, or action limits are exhausted;
- preserve account scope, trigger evidence, rule version, generated response, send result, provider reference, credit entry, retries, and sanitized failure reason;
- prevent duplicate replies and duplicate credit charges through idempotency;
- refund held credits when a provider or system failure prevents delivery.

## Default approval policy

The default operating mode is **user approval required before sending**:

- AI may generate a proposed reply automatically, but it remains a draft until the user approves it;
- the user can edit, approve, reject, or regenerate the reply;
- credits and pricing must be shown according to the configured billing rule before generation or sending;
- approval is scoped to the exact account, conversation, recipient, reply text/version, and platform action;
- editing after approval invalidates the old approval and requires a new approval;
- automatic sending is a separately enabled higher-risk mode, not the default;
- automatic-send availability is controlled by the admin dashboard by plan, platform, account, user override, and promotion;
- enabling automatic send requires a separate confirmation screen showing triggers, limits, credit rate, maximum budget, operating hours, blocked topics, escalation rules, and pause conditions;
- the user can pause or disable automatic sending at any time;
- the system must fail closed and return to approval-required mode when required permissions, budgets, provider capabilities, or safety configuration are missing;
- automatic-send mode must remain independently feature-flagged and auditable.

## Outbound DM automation

Outbound or prospecting DMs are **deferred to a later development phase**. They are not part of the initial inbound AI engagement feature.

The future phase requires a separate current-state and feasibility audit covering:

- official platform APIs and permissions;
- additional provider/API calls and their continuing costs;
- whether public-profile discovery requires an approved social-data provider or scraper;
- recipient eligibility and consent rules;
- platform rate limits, messaging windows, anti-spam controls, and account-ban risk;
- opt-out and suppression lists;
- deduplication and contact-frequency limits;
- lead/source evidence and audit trails;
- credit pricing that covers discovery, enrichment, AI generation, and delivery costs;
- provider fallback and failure/refund rules;
- legal and platform-policy review before any live test.

No scraper, outbound campaign, cold-DM workflow, recipient list, or live provider action is authorized by this roadmap decision.

## Roadmap placement

- **Initial advanced engagement phase:** inbound comment and DM replies, approval required by default.
- **Optional later mode:** inbound automatic sending after separate enablement and acceptance gates.
- **Later outbound engagement phase:** research, provider selection, cost model, safety controls, implementation, and controlled testing.
- Outbound must remain independently feature-flagged and disabled until its own acceptance gate passes.
