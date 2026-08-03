# SocialOlla Support Escalation

**Decision date:** 2026-08-03  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Core decision

When the unified assistant cannot resolve a customer problem, when the customer asks for a human, or when a system rule requires human intervention, SocialOlla automatically creates a support ticket.

The ticket is the durable handoff between the customer-facing assistant and the SocialOlla support/admin team.

## Escalation triggers

Typical triggers include:

- unresolved publishing, scheduling, comment, DM, or account-connection failures;
- payment, billing, refund, entitlement, or credit-ledger disputes;
- account-access, security, or identity-verification issues;
- provider outages or capability mismatches that the assistant cannot correct;
- repeated automated retries reaching their configured terminal limit;
- missing authority, uncertain facts, conflicting records, or safety rules requiring a human decision;
- a direct customer request to speak with support;
- any admin-configured event classified as requiring human review.

## Ticket contents

The ticket should include only the information needed to investigate and respond:

- ticket number and creation time;
- customer account and workspace identifiers;
- affected connected account, destination, post, schedule, comment, DM, Watch report, payment, credit entry, or setting;
- concise problem summary written in plain language;
- relevant user-visible conversation excerpts;
- actions already attempted and their results;
- provider references, delivery evidence, retry counts, timestamps, and sanitized error details where available;
- current severity, status, owner, and next required action;
- whether the customer is blocked, partially blocked, or only requesting information.

The ticket must not include hidden prompts, private chain-of-thought, passwords, API keys, access tokens, provider secrets, unnecessary raw payloads, or data from another user or workspace.

## Admin notification channels

After ticket creation, SocialOlla notifies the configured support/admin recipients.

- Email and SMS/text message are supported notification channels.
- Admin settings control the destination email addresses, mobile numbers, severity thresholds, quiet hours, escalation order, and fallback behavior.
- Critical security, payment, account-access, or time-sensitive publishing incidents may bypass quiet hours according to the configured policy.
- Lower-priority tickets may use email only or be grouped into a digest.
- SMS messages should contain a short summary, severity, ticket number, and secure link to the admin ticket; they must not contain secrets or unnecessary customer content.
- SMS provider costs, limits, and delivery failures must be tracked so the admin can control operating expense.
- Email should remain the fallback when an SMS send fails, unless the admin disables that fallback explicitly.
- Duplicate notifications must be suppressed with ticket and notification idempotency keys.

## Customer-facing behavior

- The assistant must clearly tell the customer that the issue was escalated rather than pretending it was solved.
- Ticket creation must not automatically retry publishing, spend credits, reconnect accounts, issue refunds, change plans, or perform any other protected action.
- The assistant may continue helping with unrelated tasks while the ticket remains open.
- Ticket status updates may be surfaced through the floating assistant and configured email alerts.
- Closing or resolving a ticket requires recorded evidence or an authorized human decision.

## Customer ticket confirmation

Immediately after successful ticket creation:

- The floating assistant shows the customer the ticket number, creation time, issue summary, current status, and expected next step.
- SocialOlla sends a confirmation email to the customer's configured operational-notification recipient.
- The confirmation email includes the ticket number, issue summary, current status, creation time, affected product area, and a secure link back to the authorized ticket view or related SocialOlla page where supported.
- The email must not expose provider secrets, raw internal logs, hidden prompts, private chain-of-thought, or information from another account or workspace.
- Ticket creation and customer confirmation must use idempotency keys so a retry cannot create duplicate tickets or send duplicate confirmations.
- If the confirmation email fails, the ticket remains valid and visible in SocialOlla; the assistant informs the customer that email delivery failed and allows a retry.
- The customer should receive later material status changes through the floating assistant and configured email-alert policy.
- Showing or emailing the ticket number does not grant any additional account permission or authorize a protected action.

## Email reply threading

Customers may reply directly to a support-ticket email and continue the same ticket conversation.

- Each outgoing ticket email uses a ticket-specific reply-to address or signed routing token that maps inbound mail to the exact ticket.
- Standard email threading headers and the ticket number in the subject should be preserved where possible so email clients display one conversation.
- An accepted customer reply is appended to the same ticket as a new customer message with sender, received time, message id, and attachment references where allowed.
- The customer does not need to start a new ticket for each reply.
- Admin replies from the ticket should return through the same email thread and also appear in the authorized SocialOlla ticket view.
- Auto-replies, delivery failures, duplicates, mail loops, spam, and malformed routing tokens must not create repeated ticket messages.
- Inbound messages must be scanned, size-limited, and sanitized before storage; executable files and unsupported attachments may be blocked.
- Only authorized sender addresses or separately verified participants may add customer-visible messages to the ticket. Unknown senders must be quarantined or require review.
- Email replies must never execute protected actions such as refunds, publishing, credit spending, account reconnection, or plan changes without the normal authenticated confirmation flow.
- Closing a ticket does not silently discard a later valid reply. The system may reopen the existing ticket or create a linked follow-up according to an admin-configured rule.
- Email-provider selection and inbound-email implementation remain operational choices, but same-ticket reply continuity is a required product behavior.

## Admin controls

The admin dashboard controls:

- which events automatically create tickets;
- severity and priority rules;
- routing by product area, platform, provider, customer plan, or issue type;
- email and SMS recipients;
- quiet hours and critical-event overrides;
- acknowledgement and response targets;
- escalation timers and reassignment rules;
- notification templates;
- SMS provider, budget, usage limits, and fallback behavior;
- inbound support-email domains, routing rules, attachment limits, allowed sender rules, spam handling, and closed-ticket reply behavior;
- individual-user or account overrides;
- ticket retention, audit history, and export controls.

No support notification rule may bypass user, workspace, account, permission, privacy, billing, or action-confirmation boundaries.
