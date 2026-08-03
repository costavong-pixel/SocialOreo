# SocialOlla Unified Assistant Scope

**Decision date:** 2026-08-02  
**Status:** Confirmed product direction  
**Applies to:** SocialOlla roadmap coordination PR #5

## Core decision

SocialOlla uses one primary assistant/chat interface across the product.

The assistant may begin as the support experience, but it is not limited to customer support. It becomes the main guided interface for helping the user operate SocialOlla.

## User-facing placement

- The assistant appears as a floating chat button across authorized SocialOlla pages.
- Opening the button displays an expandable chat panel over the current page.
- A separate full-screen assistant workspace is not required for the initial product direction.
- Normal dashboards, forms, editors, calendars, Watch pages, billing pages, and admin pages remain available.
- The assistant should understand the user's current page and authorized context so it can explain the page, prepare work, guide the user, or propose permitted actions.
- The floating control must not cover important mobile navigation, form controls, save buttons, or accessibility content.
- Users must be able to minimize, reopen, and clear the visible panel without accidentally deleting stored records or approved work.
- The assistant must preserve the active account, workspace, destination, and page scope while preventing cross-account or cross-workspace leakage.

## Cross-page conversation continuity

- The current assistant conversation remains available when the user navigates between authorized SocialOlla pages.
- Minimizing the panel, opening another SocialOlla page, or returning to the prior page must not reset the conversation.
- The assistant preserves the conversation thread, pending drafts, proposed actions, referenced records, and required confirmations while navigation occurs.
- The assistant updates its current-page context after navigation without discarding the earlier conversation context.
- Page context and conversation history are separate: changing pages may change what the assistant can currently see or propose, but it must not rewrite prior messages or approvals.
- A confirmation applies only to the exact action, version, destination, credit cost, and scope shown when the user approved it. Navigating elsewhere cannot broaden that approval.
- If a pending action becomes invalid because the user changes account, workspace, destination, plan, permission, or underlying record, the assistant must stop and request a new preview and confirmation.
- Conversation continuity is scoped to the authenticated user and authorized workspace. It must never leak across users, workspaces, connected accounts, browser sessions belonging to another user, or admin impersonation boundaries.
- The user must be able to start a new conversation without deleting completed posts, approved knowledge, Watch reports, credit records, or other product data.
- Clearing the visible chat panel and permanently deleting stored conversation history must be treated as different actions and clearly labelled.

## User-facing responsibilities

Within the user's authorized SocialOlla account and workspace, the same assistant can help with:

- product support and account guidance;
- onboarding and setup;
- connecting and labeling social accounts;
- creating titles, captions, posts, repost schedules, and scheduled comment threads;
- choosing destinations and preparing platform-specific versions;
- managing approved knowledge through manual entry, document upload, and website-page import;
- using approved knowledge and conversation context to generate engagement replies;
- reviewing, editing, approving, rejecting, or regenerating AI replies;
- running Basic Profile Analysis and other Watch actions;
- explaining credit costs, balances, holds, charges, refunds, and expiry;
- surfacing publishing failures and guiding retry or cancellation;
- answering questions about plans, features, and account limits;
- escalating to human support when the assistant lacks authority or reliable information.

## Interaction model

The assistant must distinguish between four types of behavior:

1. **Explain** — answer questions without changing data.
2. **Draft** — prepare content, settings, or replies for review.
3. **Propose action** — show the exact action, destinations, credit cost, and expected effect.
4. **Execute** — act only after the required confirmation and authorization.

The assistant may not silently publish, spend credits, change plans, connect accounts, alter knowledge, or send replies when confirmation is required.

## Knowledge intake

The same chat interface can help the user build approved knowledge by:

- asking structured questions;
- accepting manual text;
- accepting uploaded documents where supported;
- accepting website pages or URLs for import where supported;
- extracting proposed facts into reviewable knowledge items;
- requiring user approval before imported facts become active knowledge;
- showing source, status, version, effective date, and last-updated information where applicable.

Imported or extracted information must not become trusted automatically. The user must be able to review, edit, approve, disable, replace, or delete it.

## Architecture rule

This should be one assistant experience, not one giant unrestricted prompt.

Implementation should use modular skills/tools behind the assistant, including separate capability boundaries for:

- Post;
- Watch;
- knowledge management;
- engagement replies;
- billing and credits;
- support and escalation;
- admin-only operations.

Every tool call must enforce exact user, workspace, account, destination, plan, credit, and permission scope on the server.

## Credit and revenue model

- Basic help and product support may be included without credits.
- Credit-consuming actions remain separately priced and confirmed.
- The assistant must show the exact cost before generation or execution unless an already-confirmed allowance or automation budget covers the action.
- Admin controls which assistant capabilities are free, plan-included, promotional, or credit-based.
- A single chat interface therefore supports both product usability and recurring credit revenue without hiding charges.

## Safety and truthfulness

- The assistant must use verified account data, approved knowledge, current conversation context, and provider capability records.
- It must not invent platform support, business facts, publishing success, credit outcomes, or provider evidence.
- When information is missing, conflicting, stale, or outside its authority, it must explain the gap and request review or escalate.
- Human approval remains the default for higher-risk actions unless a separately enabled automation rule permits otherwise.

## Product positioning

The assistant is the operating layer for SocialOlla, not a separate support widget.

Users may still access normal dashboard pages and forms, but the floating assistant should be able to guide them to the correct page, prepare the work, or execute authorized actions from the current page.