# SocialOlla ten-platform connection setup checklist

Status: preparation artifact only. No OAuth, provider request, publishing action, configuration mutation, or production deployment was performed while preparing this checklist.

## Evidence and safety boundary

- Repository: `costavong-pixel/SocialOreo`
- Source base reviewed: `b1a87fb721e98452542fffceadb45b6ebc37b49c`
- Merged foundations reviewed: PR #55, PR #57, PR #58.
- Preparation branch: `codex/socialolla-ten-platform-connection-prep`
- Implementation model requested: GPT-6 Luna. That model was unavailable in this session; the implementation was performed by the current Codex model, exposed here as `GPT-5`.
- Independent Terra review: pending as a separate review task; Luna does not approve its own work.
- Remote evidence was read-only. Observed current release was the `b1a87fb...` release, with web/Post/Watch healthy and migrations reported up to date. Runtime evidence is a snapshot, not a substitute for a live acceptance record.
- The production audit showed Facebook and Threads connection gates and credentials present, all other shared connection gates off, all publishing gates off, and Watch provider execution already active. Do not change Watch or provider values as part of this connection day.
- Tokens, client secrets, database URLs, and other secret values are intentionally absent from this document.

## Common connection contract

All non-Instagram providers use the shared server-side routes:

| Operation | Route |
|---|---|
| Start OAuth | `/api/connections/{provider}/connect` |
| OAuth callback | `/api/connections/{provider}/callback` |
| Refresh | `POST /api/connections/{provider}/refresh` |
| Disconnect | `POST /api/connections/{provider}/disconnect` |

The production callback base is `https://socialolla.com`. State is bound to the authenticated user, provider, redirect URI, expiry, and one-time consumption. PKCE is used by the adapters that declare it. Access and refresh tokens are encrypted server-side; they are never returned to the browser or written to provider receipts. Refresh failure is represented as `REAUTH_REQUIRED`. A successful connection does not enable publishing.

The shared token key contract is `SOCIALOLLA_CONNECTION_TOKEN_ENCRYPTION_KEY` (a per-platform key is accepted first by source, and legacy fallbacks exist for compatibility). The OAuth state key is `SOCIALOLLA_OAUTH_STATE_SECRET` with the existing `AUTH0_SECRET` fallback.

Every connection also requires:

```text
NODE_ENV=production
SOCIALOLLA_ENV=production
SOCIALOLLA_PROVIDER_DISABLED=false
SOCIALOLLA_<PLATFORM>_CONNECTION_ENABLED=true
```

The current Post worker gate and each platform's publish gate remain separate. Keep every publish gate false for this setup day. Do not treat a connected destination as publishing acceptance.

## Callback inventory

### Shared non-Instagram callbacks

```text
https://socialolla.com/api/connections/facebook/callback
https://socialolla.com/api/connections/threads/callback
https://socialolla.com/api/connections/google_business/callback
https://socialolla.com/api/connections/youtube/callback
https://socialolla.com/api/connections/linkedin/callback
https://socialolla.com/api/connections/tiktok/callback
https://socialolla.com/api/connections/pinterest/callback
https://socialolla.com/api/connections/x/callback
https://socialolla.com/api/connections/reddit/callback
```

### Instagram legacy callbacks

Instagram is intentionally not routed through the shared non-Instagram service:

```text
https://socialolla.com/api/meta/instagram/callback
https://socialolla.com/api/meta/instagram/publish/callback
```

The first is the separate Insights/Profile Analysis OAuth path. The second is the destination connection path used by the Connections page and requires the separate Instagram connection gate. It does not, by itself, turn on `SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED`.

## Platform setup matrix

The labels below separate three different facts:

- **Code readiness**: the repository has a route/adapter/test contract.
- **Runtime readiness**: the required key names, gate, app configuration, and account prerequisites exist in the target runtime.
- **Live acceptance**: a real OAuth callback and destination discovery succeeded. None is claimed by this preparation task.

### Meta: Facebook, Instagram, Threads

Dashboard: [Meta for Developers Apps](https://developers.facebook.com/apps/)

| Platform | Source-derived configuration | Required permissions/scopes | Account and dashboard actions | Current status |
|---|---|---|---|---|
| Facebook | `SOCIALOLLA_META_CLIENT_ID`, `SOCIALOLLA_META_CLIENT_SECRET`, `SOCIALOLLA_FACEBOOK_CONNECTION_ENABLED`; callback `/api/connections/facebook/callback` | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` | Configure Facebook Login/Pages access and the exact callback. Use a test user/Page or an owner-controlled Page. Page discovery must return a Page access token and `PROFILE_PLUS_CREATE_CONTENT` or the supported legacy `CREATE_CONTENT` task. | Code ready after this branch's authoritative permission check. Runtime keys/gate were observed present/on, but no live acceptance performed. |
| Instagram | Legacy config: `META_INSTAGRAM_CLIENT_ID`, `META_INSTAGRAM_CLIENT_SECRET`, `META_INSTAGRAM_TOKEN_ENCRYPTION_KEY`, `META_INSTAGRAM_GRAPH_VERSION`; `SOCIALOLLA_INSTAGRAM_CONNECTION_ENABLED`; callbacks `/api/meta/instagram/callback` and `/api/meta/instagram/publish/callback` | Insights path: `instagram_business_basic`, `instagram_business_manage_insights`. Publishing connection path: `instagram_business_basic`, `instagram_business_content_publish`. | Configure the applicable Instagram/Meta product and exact redirect(s). Use an Instagram Professional account with the required Meta linkage and owner-controlled test account. Publishing remains off. | Code ready, but the read-only production audit did not confirm the legacy Instagram key set; runtime/live acceptance not ready. |
| Threads | `SOCIALOLLA_THREADS_CLIENT_ID`, `SOCIALOLLA_THREADS_CLIENT_SECRET`, `SOCIALOLLA_THREADS_CONNECTION_ENABLED`; callback `/api/connections/threads/callback` | `threads_basic`, `threads_content_publish` | Configure the Threads app/product and exact callback. Use an owner-controlled Threads account eligible for the requested permissions. | Code deliberately fails closed when the token response omits scope: current source does not infer requested scopes. A safe official post-exchange grant-evidence path was not confirmed, so live acceptance is blocked pending provider/source resolution. |

Facebook-specific hardening in this branch accepts a token response without `scope` only long enough to call the provider's `/me/permissions?fields=permission,status` endpoint, records only `granted` permissions, and still refuses persistence unless the requested permissions are present. A missing or incomplete permission response remains a failure.

Meta official references:

- [Facebook Login and Graph API](https://developers.facebook.com/docs/facebook-login/)
- [User permissions](https://developers.facebook.com/docs/graph-api/reference/user/permissions/)
- [Pages API](https://developers.facebook.com/docs/pages-api/)
- [Threads API](https://developers.facebook.com/docs/threads/)

### Google: Google Business Profile and YouTube

Dashboard: [Google Cloud Console APIs and Services](https://console.cloud.google.com/apis/dashboard)

Both adapters use `SOCIALOLLA_GOOGLE_CLIENT_ID` and `SOCIALOLLA_GOOGLE_CLIENT_SECRET` (source also accepts the legacy `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` fallback). Use separate connection gates:

| Platform | Callback | Scope | Dashboard/API actions | Account prerequisites | Status |
|---|---|---|---|---|---|
| Google Business Profile | `https://socialolla.com/api/connections/google_business/callback` | `https://www.googleapis.com/auth/business.manage` | Configure a Web OAuth client with the exact redirect. Enable the required Business Profile APIs and configure the consent screen/test users as required by Google. | Owner/test Google account must have access to at least one verified Business Profile location. Source discovers accounts, then locations. | Code ready; production key/gate were missing/off in the read-only audit; external setup required. |
| YouTube | `https://socialolla.com/api/connections/youtube/callback` | `https://www.googleapis.com/auth/youtube.upload` | Reuse the Google OAuth client only if the Google Cloud project and consent configuration cover this scope. Enable YouTube Data API v3. | Owner/test Google account must control a YouTube channel. Source discovers `channels.list` with `mine=true`. | Code ready; production key/gate were missing/off; external setup required. |

Google references:

- [Business Profile OAuth](https://developers.google.com/my-business/content/implement-oauth)
- [Business Profile basic setup](https://developers.google.com/my-business/content/basic-setup)
- [YouTube OAuth](https://developers.google.com/youtube/documentation/authentication)
- [YouTube channel discovery](https://developers.google.com/youtube/v3/guides/implementation/channels)

### LinkedIn

Dashboard: [LinkedIn Developer Apps](https://www.linkedin.com/developers/apps)

- Keys: `SOCIALOLLA_LINKEDIN_CLIENT_ID`, `SOCIALOLLA_LINKEDIN_CLIENT_SECRET`, `SOCIALOLLA_LINKEDIN_CONNECTION_ENABLED`.
- Callback: `https://socialolla.com/api/connections/linkedin/callback`.
- Source requests `openid`, `profile`, `email`, and `w_member_social`, with PKCE.
- Member publishing/discovery is the supported source path. Organization publishing is not claimed: the source does not request `w_organization_social`, and organization authorization/access must be separately approved and implemented before an organization destination can be accepted.
- Owner action: create/configure the LinkedIn app, add the exact redirect, obtain the approved member permission, and use a member test account. Do not record organization readiness from a member connection.
- Status: member connection code ready; runtime keys/gate missing/off in the audit; organization path is an external approval plus source-readiness blocker.

References: [LinkedIn OAuth access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access), [LinkedIn organization authorization](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-authorization?view=li-lms-2026-01).

### Pinterest

Dashboard: [Pinterest Developers](https://developers.pinterest.com/apps/)

- Keys: `SOCIALOLLA_PINTEREST_CLIENT_ID`, `SOCIALOLLA_PINTEREST_CLIENT_SECRET`, `SOCIALOLLA_PINTEREST_CONNECTION_ENABLED`.
- Callback: `https://socialolla.com/api/connections/pinterest/callback`.
- Scopes: `boards:read`, `boards:write`, `pins:read`, `pins:write`.
- PKCE is used. Source discovers the user and boards. Use an owner/test Pinterest account with a board that can receive Pins.
- Status: code ready; runtime keys/gate missing/off in the audit; external app setup required. The source claims board/image Pin behavior only; do not represent unsupported link behavior as accepted.

References: [Pinterest authentication](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/), [Pinterest app setup](https://developers.pinterest.com/docs/getting-started/connect-app/), [Boards and Pins](https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/).

### X

Dashboard: [X Developer Portal](https://developer.x.com/en/portal/dashboard)

- Keys: `SOCIALOLLA_X_CLIENT_ID`, `SOCIALOLLA_X_CLIENT_SECRET`, `SOCIALOLLA_X_CONNECTION_ENABLED`.
- Callback: `https://socialolla.com/api/connections/x/callback`.
- Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`; PKCE is used.
- Owner action: configure OAuth 2.0 callback and user authorization for the app/project. Use an owner/test X account; source discovers `/2/users/me`.
- Status: code ready; runtime keys/gate missing/off in the audit; external developer-plan/app setup required.

Reference: [X OAuth 2.0](https://developer.x.com/en/docs/authentication/oauth-2-0).

### Reddit

Dashboard: [Reddit Apps](https://www.reddit.com/prefs/apps)

- Keys: `SOCIALOLLA_REDDIT_CLIENT_ID`, `SOCIALOLLA_REDDIT_CLIENT_SECRET`, `SOCIALOLLA_REDDIT_CONNECTION_ENABLED`.
- Callback: `https://socialolla.com/api/connections/reddit/callback`.
- Scopes: `identity`, `submit`; the source uses a permanent authorization request and discovers the account plus subscribed communities when available.
- Owner action: create a Reddit web app with the exact callback and use an owner/test account with access to the target subreddit. The implementation is self-post/subreddit scoped; it does not claim native media or link publishing.
- Status: code ready; runtime keys/gate missing/off in the audit; external app/account setup required.

Reference: [Reddit API documentation](https://www.reddit.com/dev/api/).

### TikTok

Dashboard: [TikTok for Developers](https://developers.tiktok.com/)

- Keys: `SOCIALOLLA_TIKTOK_CLIENT_KEY`, `SOCIALOLLA_TIKTOK_CLIENT_SECRET`, `SOCIALOLLA_TIKTOK_CONNECTION_ENABLED`.
- Callback: `https://socialolla.com/api/connections/tiktok/callback`.
- Source connection scopes: `user.info.basic`, `video.publish`; source uses PKCE only where the adapter declares it and calls creator-info for eligibility. Publishing is hard-disabled in the provider factory regardless of connection state.
- Owner action: register the app, configure the exact redirect, obtain the required Content Posting API products/scopes and any audit/approval, and use a test creator account. Do not treat a creator connection as publishing approval.
- Status: connection foundation exists but production acceptance is externally blocked; TikTok publishing remains `HARD_DISABLED`. No gate should be turned on until the provider's audit/UX/media requirements and the source contract are separately accepted.

References: [TikTok Content Posting API getting started](https://developers.tiktok.com/doc/content-posting-api-get-started/), [TikTok API scopes](https://developers.tiktok.com/doc/tiktok-api-scopes/), [TikTok Content Posting API](https://developers.tiktok.com/products/content-posting-api/).

## Exact environment-key inventory

Do not paste values into this file. The key names below are the source contract:

| Purpose | Key names |
|---|---|
| Base and shared security | `APP_URL` or `APP_BASE_URL`; `SOCIALOLLA_CONNECTION_TOKEN_ENCRYPTION_KEY`; `SOCIALOLLA_OAUTH_STATE_SECRET` |
| Instagram legacy connection/insights | `META_INSTAGRAM_CLIENT_ID`; `META_INSTAGRAM_CLIENT_SECRET`; `META_INSTAGRAM_TOKEN_ENCRYPTION_KEY`; `SOCIALOLLA_INSTAGRAM_CONNECTION_ENABLED`; `SOCIALOLLA_INSTAGRAM_INSIGHTS_ENABLED`; `META_INSTAGRAM_GRAPH_VERSION` |
| Instagram publishing | `SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED` plus the legacy Instagram client/key values above |
| Facebook | `SOCIALOLLA_META_CLIENT_ID`; `SOCIALOLLA_META_CLIENT_SECRET`; `SOCIALOLLA_FACEBOOK_CONNECTION_ENABLED`; `SOCIALOLLA_FACEBOOK_PUBLISH_ENABLED` |
| Threads | `SOCIALOLLA_THREADS_CLIENT_ID`; `SOCIALOLLA_THREADS_CLIENT_SECRET`; `SOCIALOLLA_THREADS_CONNECTION_ENABLED`; `SOCIALOLLA_THREADS_PUBLISH_ENABLED` |
| Google Business Profile | `SOCIALOLLA_GOOGLE_CLIENT_ID`; `SOCIALOLLA_GOOGLE_CLIENT_SECRET`; `SOCIALOLLA_GOOGLE_BUSINESS_CONNECTION_ENABLED`; `SOCIALOLLA_GOOGLE_BUSINESS_PUBLISH_ENABLED` |
| YouTube | `SOCIALOLLA_GOOGLE_CLIENT_ID`; `SOCIALOLLA_GOOGLE_CLIENT_SECRET`; `SOCIALOLLA_YOUTUBE_CONNECTION_ENABLED`; `SOCIALOLLA_YOUTUBE_PUBLISH_ENABLED` |
| LinkedIn | `SOCIALOLLA_LINKEDIN_CLIENT_ID`; `SOCIALOLLA_LINKEDIN_CLIENT_SECRET`; `SOCIALOLLA_LINKEDIN_CONNECTION_ENABLED`; `SOCIALOLLA_LINKEDIN_PUBLISH_ENABLED` |
| TikTok | `SOCIALOLLA_TIKTOK_CLIENT_KEY`; `SOCIALOLLA_TIKTOK_CLIENT_SECRET`; `SOCIALOLLA_TIKTOK_CONNECTION_ENABLED`; `SOCIALOLLA_TIKTOK_PUBLISH_ENABLED` (publishing remains hard-disabled in code) |
| Pinterest | `SOCIALOLLA_PINTEREST_CLIENT_ID`; `SOCIALOLLA_PINTEREST_CLIENT_SECRET`; `SOCIALOLLA_PINTEREST_CONNECTION_ENABLED`; `SOCIALOLLA_PINTEREST_PUBLISH_ENABLED` |
| X | `SOCIALOLLA_X_CLIENT_ID`; `SOCIALOLLA_X_CLIENT_SECRET`; `SOCIALOLLA_X_CONNECTION_ENABLED`; `SOCIALOLLA_X_PUBLISH_ENABLED` |
| Reddit | `SOCIALOLLA_REDDIT_CLIENT_ID`; `SOCIALOLLA_REDDIT_CLIENT_SECRET`; `SOCIALOLLA_REDDIT_CONNECTION_ENABLED`; `SOCIALOLLA_REDDIT_PUBLISH_ENABLED` |
| Global safety | `SOCIALOLLA_PROVIDER_DISABLED` must remain compatible with the already-live Watch configuration; all Post publish keys remain `false` for connection-only testing |

The source accepts `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only as backward-compatible Google fallbacks. Prefer the `SOCIALOLLA_GOOGLE_*` names in any new setup. Facebook and Threads do not fall back to one another or to Instagram credentials.

## Desktop setup day: exact order

Use one browser profile signed into SocialOlla and one dashboard tab per provider family. Keep a record of timestamps, provider result query, discovered destination label, and final connection status; never record tokens or secrets.

1. **Prepare the runtime.** Confirm the current release and migration status read-only. Confirm the common encryption/state keys exist by key name only. Confirm the target account has the required plan/destination capacity. Keep every publishing gate off.
2. **Configure dashboards.** Add only the exact callback for the provider being tested. Do not add a callback guessed from another provider. Save client IDs/secrets only in the approved server-side secret store; never in this checklist, GitHub, browser notes, or screenshots.
3. **Enable one connection gate at a time.** The gate is a connection capability, not a publishing approval. Confirm `SOCIALOLLA_PROVIDER_DISABLED` and existing Watch settings are unchanged.
4. **Open the Connections page.** Expected pre-OAuth state is `Not connected`, `External approval required`, or `Hard disabled` according to the provider descriptor and gate. A connect link is meaningful only when the runtime gate and credentials are configured.
5. **Run one owner/test OAuth flow.** Expected callback is the exact URL above. The result should return to `/connections?{provider}=connected`, discover at least one eligible destination, and show encrypted server-side token state. A `reauth_required`, `invalid_state`, `unavailable`, or missing destination is a failed acceptance, not a success.
6. **Verify lifecycle without publishing.** Use the destination card to verify disconnect and reconnect. Use refresh only when a real refresh token was issued. Confirm a failed refresh becomes `REAUTH_REQUIRED`. Do not click Post, publish, schedule, or enable a publish gate.
7. **Record acceptance separately.** A provider is “live connection accepted” only after callback, eligibility discovery, encrypted persistence, reconnect/refresh behavior, and disconnect are observed. Publishing remains `NOT_TESTED`.

## Pilot order: The Slab Pizza

The pilot target is one owner-controlled account set, not synthetic provider success.

1. **Facebook:** owner supplies a Page and confirms the test user has the required Page capability. Expected destination is the Page, not merely the Facebook user.
2. **Instagram:** owner supplies a Professional account and confirms the required Meta linkage/product setup. Test connection only; do not publish.
3. **Threads:** owner supplies the Threads account and Meta app approval/scopes. Current source will not persist a token unless required permission evidence is available; do not bypass this.
4. **Google Business Profile:** owner supplies a verified location the Google test account can manage.
5. **YouTube:** owner supplies the channel controlled by the Google test account.
6. **LinkedIn:** start with a member account. Organization publishing is a separate readiness item.
7. **Pinterest:** owner supplies a board for discovery; use the source's board/image contract.
8. **X:** owner supplies an account and confirms the app/project plan allows the requested OAuth scopes.
9. **Reddit:** owner supplies a test account and target subscribed subreddit; acceptance covers self-post destination discovery only.
10. **TikTok:** connection setup may be prepared, but publishing stays hard-disabled and live acceptance waits for provider approval/audit requirements.

## Findings and blockers

### Ready for external setup

- The shared state/PKCE/token-encryption/refresh/disconnect architecture exists and has focused tests.
- Facebook, Google Business Profile, YouTube, LinkedIn member, Pinterest, X, and Reddit self-post connection contracts have source adapters and callback routes. Their runtime audit blockers are app credentials/gates, not a request to enable publishing.
- Instagram has separate connection and publishing gates; connection testing does not authorize Post publishing.

### Source or acceptance blockers

- **Threads permission evidence:** the provider token shape may omit `scope`. The adapter accepts that shape but the shared save path correctly refuses to persist without explicit required-scope evidence. No safe inference or unverified fallback is allowed. This needs a provider-documented evidence path or a separately reviewed source change.
- **Destination type durability:** Prisma's `Destination` model does not store `destinationType`; the shared view currently derives the platform's default. This can mislabel a LinkedIn organization or Reddit account/subreddit after persistence. Correct durable handling would require an additive schema change and migration, which is outside this no-production-migration preparation task.
- **LinkedIn organizations:** the current source requests member scope only. Organization readiness is not claimed until the required organization permission/access and current organization discovery contract are implemented and reviewed.
- **TikTok:** external app approval/audit and provider UX/media requirements remain. TikTok publishing is hard-disabled in source.
- **Runtime readiness:** the read-only production snapshot lacked confirmed Instagram legacy keys and all non-Meta provider keys; Facebook/Threads connection credentials/gates were observed present, but no live OAuth acceptance was performed.

### Not part of this task

- No production env changes, provider activation, publishing, live OAuth, migration, deployment, Watch change, Square change, pricing change, or credential rotation.

## Acceptance record template

Copy this template into a private operator note, not into the repository if it will contain account identifiers:

```text
provider=
dashboard_callback_confirmed=YES|NO
runtime_gate_observed=ON|OFF|NOT_CHECKED
oauth_result=connected|reauth_required|invalid_state|unavailable|failed|NOT_RUN
destination_eligible=YES|NO|NOT_RUN
token_persisted_encrypted=YES|NO|NOT_RUN
refresh_or_reconnect=PASS|FAIL|NOT_RUN
disconnect=PASS|FAIL|NOT_RUN
publishing_test=NOT_RUN
blocker=
```

Final readiness is the least-ready of code, runtime, and live acceptance. Do not promote “OAuth callback returned” to “publishing works.”
