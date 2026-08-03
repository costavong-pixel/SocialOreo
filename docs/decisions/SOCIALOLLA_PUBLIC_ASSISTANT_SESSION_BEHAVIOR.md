# SocialOlla Public Assistant Session Behavior

**Decision date:** 2026-08-03  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Core decision

SocialOlla may show the unified assistant on the public website before login, but it must behave according to the user's current session, permissions, product state, and plan.

This is not a lower-quality or misleading version of the product assistant. It uses the same communication standard, product knowledge, tone, and truthfulness rules, while exposing only capabilities that are safe and available before authentication.

## Session-aware behavior

The assistant must identify and clearly respect the current session type:

1. **Public guest session** — no authenticated account or private product access.
2. **Signed-in customer session** — access only to the exact authorized user, workspace, connected accounts, plan, credits, records, and tools.
3. **Admin or support session** — access only to separately authorized admin/support capabilities and audit controls.

The assistant must never mix data, permissions, promises, or actions between these session types.

## Public guest capabilities

Before login, the assistant may:

- explain SocialOlla Post and Watch;
- answer pricing, plan, credit, feature, platform, refund, and launch-offer questions using current approved product data;
- compare plan options and explain included versus credit-based capabilities;
- guide visitors through signup, login, password recovery, and account verification;
- explain supported publishing platforms and known capability limits;
- demonstrate example workflows using clearly labelled sample data;
- collect a visitor's sales or support question;
- create a pre-login support or sales ticket when appropriate;
- offer a secure transition to signup or login for actions requiring an account.

## Approved anonymous launch flow

- Public visitors may begin chatting anonymously without entering an email address.
- SocialOlla requests an email address only when the visitor asks for something that requires identity or delivery, including a support ticket, transcript, saved progress, follow-up, or account signup.
- Providing an email for one purpose does not automatically authorize marketing, create an account, or grant access to private product data.
- The assistant must explain why the email is needed before requesting it.
- Anonymous conversation context may be transferred into a new or existing signed-in account only after explicit visitor consent.
- After signup or login, the assistant must revalidate the actual plan, credits, permissions, connected accounts, feature flags, and provider capabilities before continuing.
- Public-session assumptions, previews, or promises do not become authenticated entitlements or executable approvals.
- Abuse controls, guest message limits, and rate limits may be applied, but they must not intentionally reduce answer quality or misrepresent the product.

## One free live AI demo

Each anonymous visitor may use one free live Post demonstration before signup.

- The demonstration may generate one useful title-and-caption result from a visitor-provided topic, product, offer, idea, or description.
- The demo should use the same approved generation quality standard as the signed-in product rather than a deliberately weakened model or prompt.
- The result must be clearly labelled as a demo and remain editable or copyable during the active guest session.
- The demo cannot publish, schedule, connect a social account, access private data, consume purchased credits, or create an authenticated entitlement.
- The demo is not permanently saved unless the visitor signs up or logs in and explicitly consents to transferring it.
- After the free generation has been used, further AI generation requires signup or login unless an admin-configured promotion grants another demo.
- SocialOlla must explain the signup requirement before requesting account information; it must not pretend the first result failed merely to force registration.
- Abuse prevention may use privacy-conscious session, device, network, rate-limit, or risk signals, but it must not merge unrelated visitors or expose tracking details.
- Admin controls whether the demo is enabled, its eligible pages, generation type, model/provider, cost ceiling, usage limits, promotions, and abuse thresholds.
- Demo usage and provider cost must be measurable so the owner can compare conversion value against acquisition cost.

## Public guest restrictions

Before login, the assistant must not:

- access or claim access to private accounts, connected social profiles, posts, Watch reports, credits, billing records, messages, or support tickets;
- publish, schedule, analyze a private profile, send a reply, buy credits, change a plan, or perform any protected action;
- pretend a feature is available when it is disabled, deferred, unsupported by the platform, restricted by plan, or still under development;
- present a sales answer that contradicts the actual signed-in product behavior;
- use lower-quality, generic, or intentionally incomplete answers merely because the visitor is not signed in;
- promise unlimited, automated, or platform-specific behavior beyond the real configured entitlement and provider capability.

## No bait-and-switch rule

The assistant must not offer a feature publicly and then replace it after login with materially worse behavior, missing functions, hidden charges, or contradictory restrictions.

For every public product claim, SocialOlla should maintain a corresponding source of truth covering:

- current availability;
- supported platforms;
- included or credit-based status;
- plan eligibility;
- fair-use or anti-abuse limits;
- known provider or API restrictions;
- whether the feature is live, beta, promotional, deferred, or unavailable.

When a public statement depends on plan, provider, account permissions, or current availability, the assistant must explain that condition before encouraging signup or purchase.

## Quality consistency

Across public, customer, and admin sessions:

- answers must remain clear, useful, direct, and based on approved current product information;
- the assistant must not invent features, prices, provider support, publishing success, or customer entitlements;
- the assistant should recommend the most appropriate available path rather than pushing an unsuitable upgrade;
- unsupported actions must be explained with the real reason and the nearest valid alternative;
- the same product terminology and policy definitions should be used across sessions.

The difference between sessions is authority and private context, not answer quality.

## Transition from public to signed-in session

When a visitor signs up or logs in:

- the assistant must explicitly switch to the authenticated session and re-check plan, permissions, credits, connected accounts, and feature availability;
- public-session assumptions do not become authenticated facts automatically;
- any proposed protected action must be rebuilt against the authenticated account and shown for confirmation;
- no public-session approval authorizes publishing, credit spending, account connection, plan changes, or message sending;
- useful public conversation context may be carried forward only with the user's consent and without leaking data between users or browser sessions;
- the assistant must clearly explain when login unlocks a real capability rather than implying that login alone guarantees unsupported access.

## Sales and support integrity

- Sales answers must use the same approved pricing and feature source as the signed-in billing and plan pages.
- Support answers must use the same approved help content and escalation policy as the signed-in assistant.
- Public support escalation may collect contact details and create a ticket, but must not expose private ticket data without authentication.
- Public lead capture, support tickets, and marketing consent are separate actions; providing an email for support must not automatically subscribe the visitor to marketing.

## Admin controls

The admin dashboard controls:

- whether the public assistant is enabled;
- pages where it appears;
- allowed public capabilities;
- approved product knowledge and pricing sources;
- lead-capture and support-ticket routing;
- guest message limits and abuse controls;
- free-demo availability, scope, provider, cost limit, and promotions;
- human escalation rules;
- public-session retention and consent settings;
- which claims or features are hidden, promotional, beta, invite-only, or unavailable;
- audit logs for public claims, demos, escalations, and session transitions.

No admin configuration may make the public assistant claim a capability that the current product, plan, provider, or platform cannot actually deliver.
