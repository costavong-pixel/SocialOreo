# SocialOlla Session Security Log

**Status:** Accepted implementation decision  
**Date:** 2026-08-27  
**Purpose:** Persistent authentication-session evidence for security playbooks, incident response, and account-support investigations.

## Decision

SocialOlla will persist privacy-minimized authentication session events in the existing `AuditEvent` table instead of introducing a second security-log datastore.

The first event is:

`AUTH_SESSION_ESTABLISHED`

It is emitted from the server-side Auth0 `beforeSessionSaved` boundary. The event means **Auth0 supplied a session that SocialOlla was about to save**. It must not be interpreted as proof that a later SocialOlla workspace authorization, provider connection, payment, Post, or Watch action succeeded.

## Stored fields

Use existing `AuditEvent` columns:

- `externalId` — opaque/deterministic audit identifier where a provider session reference is available.
- `workspaceId` — initially `null` at the Auth0 callback boundary because a newly authenticated identity may not yet have been synchronized to a SocialOlla workspace.
- `actorAuthUserId` — Auth0 subject. This is the canonical identity correlation field already used by audit events.
- `eventType` — `AUTH_SESSION_ESTABLISHED`.
- `occurredAt` — server timestamp.
- `payload` — allow-listed security metadata only.

Allowed payload metadata:

- `provider`: `Auth0`
- `connectionProvider`: provider label derived from the Auth0 subject, such as `google-oauth2`, when safely derivable
- `providerEmailVerified`: boolean provider claim
- `sessionRef`: one-way SHA-256-derived short reference when `sid` or `auth_time` is available
- `sessionRefSource`: `sid`, `auth_time`, or `generated`
- `environment`: `SOCIALOLLA_ENV` if configured
- `revision`: release revision if configured

## Data that must never be stored

The session audit event must not persist:

- access tokens
- refresh tokens
- ID tokens
- session cookies
- raw Auth0 `sid`
- authorization codes
- OAuth state
- client secrets
- provider secrets
- raw request headers
- passwords
- raw IP address
- raw user-agent string

IP/user-agent correlation can be added later only after an explicit privacy/security decision defines necessity, minimization, hashing/keying, retention, and access control.

## Session correlation

When Auth0 provides a `sid`, SocialOlla derives `sessionRef` from the Auth0 subject plus `sid` using SHA-256 and stores only a shortened digest. The raw `sid` is discarded.

If `sid` is unavailable but `auth_time` is present, the subject plus authentication time is used to derive the correlation reference.

If neither claim is available, a random opaque audit identifier is used. Such an event remains useful as evidence but cannot be safely deduplicated as the same provider session.

The digest is for correlation, not authentication. It must never be accepted as a credential.

## Failure semantics

Session-audit persistence is observational. Failure to write the audit record must not silently turn into an authentication grant or denial and must not modify Auth0 claims.

The Auth0 session boundary therefore records persistence failures through server-side auth diagnostics and returns the original session unchanged.

The final security release review must verify that audit failure cannot bypass normal authorization and that the logging path cannot expose credentials.

## Workspace association

The initial callback event may have `workspaceId=null`. Later application security events can reference a canonical workspace after subject-to-User synchronization. Do not guess or accept a workspace id from the browser at the authentication callback boundary.

If future playbook requirements need a materialized session record with `firstSeenAt`, `lastSeenAt`, explicit logout, revocation, or device management, introduce that as a separate reviewed design rather than overloading this audit event.

## Security playbook use

Typical incident-response questions supported by this event:

- Was a provider session established for this Auth0 subject around a reported time?
- Which identity provider was involved?
- Did the provider report the email as verified at session establishment?
- Do multiple audit records correlate to the same provider session reference?
- Was the event recorded in staging or production and on which release revision?

This event does **not** prove:

- that SocialOlla authorized access to a workspace;
- that the customer performed a specific product action;
- that a provider OAuth connection for Instagram/TikTok/etc. succeeded;
- that a payment, Post, or Watch action succeeded.

Those actions require their own audit/provider evidence.

## Retention and access

No new retention duration is invented by this change. Before production launch, the final security/privacy gate must explicitly decide:

- retention duration;
- who may query/export session audit records;
- incident-response export procedure;
- deletion/retention interaction with account deletion and legal obligations;
- alert thresholds for suspicious session patterns.

Until that decision is approved, do not add an automatic purge policy that could silently destroy incident evidence.

## Acceptance tests

Minimum code acceptance:

1. valid Auth0 callback session creates `AUTH_SESSION_ESTABLISHED` through the audit writer;
2. the original session object is returned unchanged;
3. no ID token is passed to or persisted by the audit writer;
4. raw `sid` is never included in the persisted payload;
5. a repeated callback with the same subject + `sid` is idempotent at the audit-event key;
6. audit persistence failure leaves the authentication decision unchanged and produces a diagnostic failure signal;
7. no raw email is duplicated into the audit payload.

Final production acceptance belongs to the end-of-application security gate in `docs/SOCIALOLLA_CURRENT_EXECUTION_PLAN.md`.
