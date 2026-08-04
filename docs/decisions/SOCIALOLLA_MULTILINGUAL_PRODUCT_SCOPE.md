# SocialOlla Multilingual Product Scope

**Decision date:** 2026-08-03  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5 and Milestone 1

## Core decision

Multilingual support is a foundation requirement for SocialOlla, not a later translation add-on.

The public website, customer application, unified assistant, onboarding, Post, Watch, notifications, support, billing explanations, and operational messages must be designed around explicit locale and content-language settings from Milestone 1.

The architecture must not assume that the interface language, assistant conversation language, connected social-account language, and generated post language are always the same.

## Separate language controls

SocialOlla must keep these settings independent:

1. **Interface locale** — menus, buttons, settings, validation, billing explanations, notices, dates, numbers, and help content.
2. **Assistant conversation language** — the language used by the unified chatbot for onboarding, support, Post, Watch, and explanations.
3. **Profile/default content language** — the normal language and tone for a profile or connected account.
4. **Campaign or post language** — the language selected for a specific campaign, post, comment, reply, or scheduled item.
5. **Report language** — the language used to present Watch findings while preserving source-language evidence.
6. **Notification language** — the language used for email, in-app alerts, support confirmations, and operational messages.

A user may change one without silently changing the others.

## Multilingual onboarding and assistant

- The public and signed-in assistant should detect the visitor's language as a suggestion, then allow the user to confirm or change it.
- The assistant must be able to collect profile information, fill gaps, explain permissions, and provide support in the selected conversation language.
- User-provided facts must remain attached to their source and must not be altered by translation.
- Proposed translations, inferred meanings, and normalized names must be shown as proposals when they could change factual meaning.
- The assistant may ask a targeted clarification when a term, product name, address, policy, or cultural expression is ambiguous.
- Switching conversation language must not lose the active session, approvals, selected account, or protected-action boundaries.

## Post language behavior

- Each profile and connected social account may have its own default content language or language mix.
- Each post, caption, title, first comment, later thread comment, and AI engagement reply stores its language explicitly.
- A user can request one language, bilingual content, or separate destination variants where supported.
- Translation creates a linked variant; it must not overwrite the approved source version.
- Generated variants require their own preview and approval because platform limits, hashtags, calls to action, tone, and cultural meaning can change by language.
- Character-count and platform-validation checks run against the final translated text, not only the source text.
- SocialOlla must preserve brand names, product names, handles, URLs, promo codes, legal terms, and approved no-translate phrases.
- The assistant must not translate or localize factual claims into stronger or different claims.

## Watch language behavior

- Watch may analyze public material in its original language when provider and model support allow.
- Reports may be displayed in the user's selected report language.
- Important source excerpts, account names, links, timestamps, and evidence remain traceable to the original language.
- Machine-translated evidence must be labelled as translated.
- Sentiment, intent, slang, and cultural interpretation should be treated as uncertain when confidence is low rather than presented as fact.

## Public website, support, and notifications

- Public pricing, feature, credit, refund, fair-use, privacy, and capability statements must use the same approved source of truth in every supported locale.
- A translated sales page may not promise behavior that differs from the signed-in product.
- Support tickets retain the original customer message and may include a translated working copy for support staff.
- Email replies continue the same ticket regardless of language.
- Critical billing, security, disconnection, credit, and delivery notices must be available in the user's selected notification language before that locale is considered launch-ready.

## Data and API requirements

Canonical records should support fields or linked records equivalent to:

```text
interface_locale
assistant_locale
notification_locale
profile_default_language
account_default_language
source_language
content_language
translation_group_id
translation_source_id
translation_status
no_translate_terms
locale_version
```

Language must not be inferred permanently from country, timezone, browser settings, name, or connected platform alone.

All text storage, search, export, imports, logs, and APIs must preserve Unicode safely. Normalization must not corrupt accents, non-Latin scripts, emoji, hashtags, handles, or right-to-left text.

## Engineering and test requirements

Milestone 1 must establish:

- a locale framework for the customer shell and public assistant;
- server-side locale resolution and user-controlled overrides;
- language-aware profile, Post, Watch, notification, and support contracts;
- translation keys rather than hard-coded customer-facing strings in new shared UI;
- fallback behavior when a translation is missing;
- tests for accented Latin text, Chinese, a right-to-left language, emoji, mixed-language captions, hashtags, links, and platform length limits;
- safe rendering for right-to-left layouts even if full RTL market launch occurs later;
- preservation of source and translated variants through editing, scheduling, retries, exports, and audit history;
- no duplicate publishing or duplicate credit charge when language variants are retried.

## Credits and cost

- Changing the interface language, assistant language, or manually entering multilingual text is plan-included.
- Basic text translation may be plan-included within admin-configurable fair-use limits.
- Provider-cost operations such as large batch translation, image text localization, video dubbing, subtitles, or high-volume multilingual generation may use allowances or credits.
- Any credit cost must be shown and confirmed before processing.
- Translation failures caused by the provider or system follow the existing hold, finalize, and refund rules.

## Launch-language rule

The exact first launch-language list remains a commercial prioritization decision. It does not block the architectural requirement.

A locale is considered fully launch-ready only when its public claims, onboarding, core Post flow, Watch explanations, billing/credit notices, critical notifications, support escalation, and acceptance tests are complete. Partial locales must be labelled accurately rather than presented as fully supported.

## Milestone 1 addition

Milestone 1 now includes multilingual architecture and acceptance proof across the unified customer shell, assistant, profile onboarding, connected-account context, first destination-specific post, seven-day plan, Watch presentation contracts, notifications, and support boundaries.
