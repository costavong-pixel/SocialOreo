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
- prevent duplicate replies and duplicate credit charges through idempotency.

## Default approval policy

The default operating mode is **user approval required before sending**:

- AI may generate a proposed reply automatically, but it remains a draft until the user approves it;
- the user can edit, approve, reject, or regenerate the reply;
- credits and pricing must be shown according to the configured billing rule before generation;
- approval is scoped to the exact account, conversation, recipient, reply text/version, and platform action;
- editing after approval invalidates the old approval and requires a new approval;
- automatic sending is a separately enabled higher-risk mode, not the default;
- automatic-send availability is controlled by the admin dashboard by plan, platform, account, user override, and promotion;
- enabling automatic send requires a separate confirmation screen showing triggers, limits, credit rate, maximum budget, operating hours, blocked topics, escalation rules, and pause conditions;
- the user can pause or disable automatic sending at any time;
- the system must fail closed and return to approval-required mode when required permissions, budgets, provider capabilities, or safety configuration are missing;
- automatic-send mode must remain independently feature-flagged and auditable.

## Reply output policy

Each AI engagement generation action produces **one recommended reply**.

- SocialOlla does not generate several reply choices in one paid action by default.
- The recommended reply must be editable before approval or sending.
- The generated reply should use the configured account tone, language, approved knowledge, conversation context, blocked-topic rules, and escalation policy.
- If the user wants a different recommendation, regeneration is a new generation action and may use another allowance unit or credit charge.
- Admin controls may provide free regenerations, promotional regenerations, plan-included regenerations, or a separate regeneration price.
- A system retry under the same idempotency key is not a regeneration and cannot create another charge.
- One generated reply must map to one exact source message or comment, account, conversation, recipient, rule version, and response version.

## Reply knowledge policy

Every recommended AI reply must combine the relevant information available from both the live conversation and the user's approved knowledge.

Required context sources include, when relevant and available:

- the current incoming comment or direct message;
- recent messages in the same conversation or thread;
- the connected account identity, selected tone, language, and reply rules;
- approved business or personal profile information;
- approved products, services, prices, opening hours, locations, delivery areas, FAQs, promotions, contact details, refund rules, cancellation rules, and other saved policies;
- platform capability and messaging restrictions;
- blocked topics, escalation instructions, and human-handoff rules.

Rules:

- Conversation context and approved knowledge are complementary inputs, not alternative modes.
- SocialOlla must retrieve only knowledge authorized for the exact user, workspace, and connected account.
- The AI must prefer approved current information over unsupported assumptions or generic model knowledge.
- Knowledge items should support source, owner, status, version, effective date, and last-updated metadata where applicable.
- Draft, expired, disabled, unapproved, or cross-account knowledge must not be used.
- When relevant approved information is unavailable, conflicting, expired, or uncertain, the AI must not invent an answer.
- In uncertain cases, the recommended reply should acknowledge the need to confirm and flag the conversation for human review or escalation.
- The generated reply record must preserve which approved knowledge references and conversation scope were used, without exposing secrets or unnecessary private data.
- Knowledge updates must not silently alter an already generated or approved reply; regeneration is required to apply newer knowledge.

## Credit charging point

AI engagement credits are charged when SocialOlla successfully produces a usable reply, not when the reply is approved or sent.

- Before generation, show the exact credit cost and require confirmation, unless an already-confirmed automation budget covers the action.
- Place a credit hold before generation.
- Finalize the charge only when a usable reply is successfully generated and stored for the user.
- If generation fails, times out, or returns an unusable result, automatically refund the held credits.
- Rejecting or choosing not to send a successfully generated reply does not refund the generation charge because the AI result was delivered.
- Editing the generated reply manually does not create another generation charge.
- Regenerating creates a new AI generation action and may charge again according to the current admin-configured rate, allowance, or promotion.
- Duplicate generation retries under the same idempotency key cannot create duplicate charges.
- Sending the already-generated reply does not create an additional AI-generation charge.
- A platform send failure does not refund the completed generation charge. Any separately configured delivery charge must follow its own hold, success, failure, and refund policy.
- The admin dashboard controls generation cost, regeneration cost, free-generation allowances, promotional credits, plan inclusion, and individual-user overrides.

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
