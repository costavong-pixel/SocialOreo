# SocialOlla Assisted Onboarding Profile

**Decision date:** 2026-08-03  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Core decision

SocialOlla onboarding begins by helping the user build a usable profile before generating the first post.

The unified assistant leads this setup conversationally. It collects what the user knows, detects important gaps, asks only the necessary follow-up questions, proposes sensible completions, and converts the conversation into a structured profile for the user's review.

The assistant does not require the user to understand marketing terminology or complete a long rigid form before receiving value.

## Adaptive profile types

The profile flow must work for a regular individual user and adapt to the user's actual purpose, including:

- personal creator or hobby account;
- product, service, local business, store, restaurant, or professional practice;
- event, promotion, campaign, cause, community, or organization;
- affiliate, educator, artist, coach, freelancer, or other supported use case.

The assistant should not assume every user owns a business.

## Information the assistant may collect

The assistant should gather the information relevant to the selected use case, including:

- profile or display name;
- what the user does, offers, promotes, or wants to discuss;
- primary goal;
- intended audience;
- products, services, topics, offers, or campaign details;
- differentiators, proof, benefits, or important facts;
- preferred tone, language, style, and words to avoid;
- location, service area, opening hours, availability, or delivery details where relevant;
- website, contact details, calls to action, and approved links;
- preferred social platforms and connected-account labels;
- posting goals, frequency, content formats, and scheduling preferences;
- policies, restrictions, prohibited claims, sensitive topics, and escalation instructions;
- existing brand assets, images, documents, menus, FAQs, website pages, or social-profile information the user chooses to provide.

Irrelevant fields should be skipped rather than shown as mandatory.

## Conversational gap filling

The assistant may help fill gaps by:

- asking a short targeted question;
- summarizing information already provided;
- extracting proposed facts from approved documents, website pages, or user-provided profile links;
- suggesting an audience, goal, tone, call to action, content direction, or missing profile field based on the supplied information;
- offering a reasonable draft when the user is unsure.

Rules:

- Suggested or inferred information must be clearly marked as proposed, not treated as confirmed fact.
- The assistant must not invent prices, policies, credentials, achievements, locations, opening hours, product claims, or other factual business information.
- The user can accept, edit, reject, skip, or return to every proposed item.
- Only user-approved information becomes active profile data or approved knowledge.
- The assistant should avoid repeatedly asking for information already available in the current conversation or approved imports.

## Corrected launch onboarding flow

1. User signs up or begins the authenticated onboarding session.
2. The assistant asks what the user wants SocialOlla to help promote, communicate, or accomplish.
3. The assistant starts a conversational profile interview adapted to that purpose.
4. The user may answer in natural language, paste information, upload supported documents, provide website pages, or use a combination of methods.
5. The assistant extracts structured profile fields, identifies meaningful gaps, and asks only targeted follow-up questions.
6. The assistant proposes completions for uncertain non-factual fields such as audience, tone, goals, calls to action, and content direction.
7. The user reviews and approves the resulting profile summary.
8. SocialOlla asks the user to connect at least one supported social account before creating the first destination-ready post.
9. The user selects and labels the connected Instagram or TikTok account that the profile and first post belong to.
10. With permission, SocialOlla reads available account metadata and recent public content to improve tone, context, platform fit, and duplicate-content avoidance.
11. The assistant shows any meaningful difference between the manually approved profile and information obtained from the connected account, then asks the user to approve updates rather than changing the profile silently.
12. Using the approved profile plus the selected connected-account context, the assistant creates the first title, caption, and draft post.
13. The user edits and previews the actual destination-specific version before choosing Publish or Schedule.
14. Publishing or scheduling still requires its own exact destination, timing, credit-cost, and action confirmation.

## Connection-first rule

- A destination-ready onboarding post must not be created as though it belongs to a real channel before that channel is connected and selected.
- Connecting first lets SocialOlla validate the account identity, platform, permissions, supported formats, caption limits, media requirements, comment capability, and publishing availability.
- It also lets the assistant use relevant profile context and recent public content where the platform and granted permissions allow.
- SocialOlla must not claim that connecting an account guarantees every API capability; unsupported or unavailable operations must be shown before the first post is prepared.
- A generic unsaved example may still be shown on the public website as the approved anonymous demo, but it is not the authenticated user's first destination-ready post.
- Users may explicitly skip account connection only to explore generic drafting. Such a draft must be labelled unassigned, cannot publish or schedule, and must be revalidated after a destination is connected.

## Progressive completion

- The user may skip nonessential profile fields, but SocialOlla should request the minimum information needed to connect and identify the selected account correctly.
- The assistant should explain which missing information could improve the result without blocking normal use unnecessarily.
- Profile setup can continue later through the same floating assistant.
- A profile-completeness indicator may show useful missing areas, but must not become an artificial score or mandatory marketing checklist.
- Required information should be requested only when a selected action, platform, provider, legal rule, billing step, or feature genuinely needs it.

## Profile review and maintenance

- The profile remains editable from both normal settings pages and the unified assistant.
- The user must be able to view which fields are confirmed, proposed, imported, expired, disabled, or missing.
- The assistant should identify the source and last-updated time for imported or time-sensitive information where applicable.
- Changes to profile information must not silently rewrite already published posts, completed reports, or approved replies.
- Future generated content uses the latest approved profile version.
- Account-specific profile information must remain isolated from other connected accounts and future agency workspaces.

## Relationship to approved knowledge

The onboarding profile provides the user's core identity, goals, audience, voice, and operating context.

Detailed products, services, FAQs, prices, policies, locations, hours, promotions, and documents may also become approved knowledge after review. The assistant uses the approved profile, relevant approved knowledge, and selected connected-account context when generating content or replies.

## Credit and cost treatment

- Conversational onboarding, profile entry, profile review, account connection, and manual editing should be plan-included unless a provider or future plan creates a separately disclosed cost.
- Importing or processing large documents, websites, images, social-history data, or other provider-cost operations may be allowance-based or credit-based.
- Any credit cost must be shown and confirmed before processing.
- The assistant may not hide a provider-cost action inside a supposedly free profile question or account-connection step.

## Acceptance requirement

The first-post onboarding experience is not complete unless a new user can:

- explain their purpose in ordinary language;
- receive targeted gap-filling help;
- review and approve a structured profile;
- connect and select a supported social account;
- understand what account information and permissions SocialOlla can actually use;
- generate a relevant destination-ready first draft from the approved profile and connected-account context;
- preview the exact destination version before publishing or scheduling.
