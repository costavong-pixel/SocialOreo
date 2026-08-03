# SocialOlla Assistant Session and Transcript Policy

**Decision date:** 2026-08-02  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Session continuity

- The floating assistant preserves the active conversation while the authenticated user moves between authorized SocialOlla pages in the same active session.
- Assistant conversation history is not intended to resume after logout.
- Assistant conversation history is not synchronized to another device.
- Signing in again starts a new assistant conversation unless a future plan explicitly changes this policy.
- Ending an assistant session must not delete posts, schedules, approved knowledge, Watch reports, credit records, publishing evidence, or other product records created through the conversation.
- Pending actions that were not confirmed or completed must not execute after logout.

## Transcript offer

- SocialOlla asks the user whether they want a copy of the visible conversation transcript before logout or when they choose to end or clear the assistant session.
- A transcript-export option must also remain available from the chat panel menu during the active session, so the user does not depend only on the logout prompt.
- Declining the transcript must not block logout or ending the session.
- Transcript creation is user-initiated and must clearly state what will be included.

## Transcript contents

The copy may include only user-visible session information, such as:

- user messages;
- assistant replies;
- visible action previews and confirmations;
- visible credit-cost notices and outcomes;
- visible links or identifiers for posts, schedules, Watch reports, or other records created during the session;
- session date and time information.

The transcript must not include:

- hidden prompts or internal reasoning;
- API keys, tokens, passwords, or provider secrets;
- raw server logs or internal stack traces;
- private data from another user, workspace, connected account, or admin scope;
- hidden provider payloads or internal security metadata.

## Privacy and reliability

- The transcript must be scoped to the exact authenticated user and active workspace.
- Generating a transcript must not change product data or repeat any action.
- Transcript generation must not consume credits unless a future explicitly priced premium export format is introduced and shown before confirmation.
- If transcript generation fails, logout or session closure must still remain available.
- The system should record that an export was requested and whether it succeeded, without storing unnecessary transcript content in operational logs.

## Email delivery

- Email is the default and initial transcript delivery method.
- Before sending, SocialOlla must show the destination email address and require confirmation.
- The user's verified account email should be prefilled when available.
- The email must identify the SocialOlla account, transcript session date/time, and active workspace without exposing secrets or unnecessary internal identifiers.
- The transcript may be placed in the email body or attached in a standard readable format, according to the configured email provider and message-size limits.
- Transcript emails must use a unique delivery idempotency key so retries cannot send accidental duplicates.
- Delivery status, timestamp, recipient address, and sanitized failure reason must be recorded without logging the full transcript unnecessarily.
- If email delivery fails, the user should be told clearly and allowed to retry during the active session.
- Email delivery is included without credits unless a future separately priced premium transcript service is introduced and confirmed before use.
- A downloadable transcript is not required for the initial product direction, but may be added later.

## Remaining email-address decision

The product still needs to decide whether transcript delivery is restricted to the verified account email or may also be sent to another verified address entered by the user.
