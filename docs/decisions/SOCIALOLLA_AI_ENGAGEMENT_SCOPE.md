# SocialOlla AI Engagement Scope

**Decision date:** 2026-08-02  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Initial advanced feature

The first AI engagement automation scope is **inbound only**:

- generate or send replies to incoming public comments where supported;
- generate or send replies to incoming direct messages where supported;
- support draft-only, approval-required, and automatic-send modes when enabled by plan/admin policy;
- charge through universal credits, plan allowances, free trials, or promotional credits;
- require a confirmed daily or monthly credit budget before an ongoing rule starts;
- stop automatically when credits, budget, permissions, provider capability, messaging windows, or action limits are exhausted;
- preserve account scope, trigger evidence, rule version, generated response, send result, provider reference, credit entry, retries, and sanitized failure reason;
- prevent duplicate replies and duplicate credit charges through idempotency;
- refund held credits when a provider or system failure prevents delivery.

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

- **Initial advanced engagement phase:** inbound comment and DM replies.
- **Later outbound engagement phase:** research, provider selection, cost model, safety controls, implementation, and controlled testing.
- Outbound must remain independently feature-flagged and disabled until its own acceptance gate passes.
