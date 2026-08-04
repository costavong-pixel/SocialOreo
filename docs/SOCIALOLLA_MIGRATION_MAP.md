# SocialOlla Migration Map

**Status:** Scaffold pending post-PR #4 comparative audit  
**Final target repository:** Not selected  
**Migration rule:** Preserve both source repositories and use reversible, tested steps

## Purpose

This map converts the repository comparison into explicit source-to-target module
and data migrations. No row may move to implementation until its selected source,
target representation, tests, rollback, and ownership are approved.

## Canonical domains to map

| Domain | Content Factory source | SocialOreo source | Canonical target decision | Migration/compatibility requirements |
|---|---|---|---|---|
| User identity | Pending audit | Pending audit | Pending | Preserve account identity, login recovery, consent, and entitlement ownership |
| Workspace | Business/workspace-scoped protected workflows | Workspace ownership exists in Watch path | One personal workspace for initial individual plan; future agency extensibility | Fail-closed isolation and no accidental creation of multi-workspace benefits |
| Brand/profile | Multi-brand/private workflow history pending detailed audit | Product/profile concepts pending audit | Individual plan must not expose agency-style multiple workspaces | Map legacy brand data without losing ownership or destination binding |
| Destination/social account | Destination-specific feed and adapter concepts | Connected-account model pending audit | Multiple labeled accounts per user | Platform, external ID, display label, permissions, token reference, health, and status |
| Campaign | Campaign and single-chat workflows | Pending audit | Pending | Preserve goals, dates, generation settings, ownership, and revision history |
| Content/post | Review, approval, revision, rendering, scheduling, delivery states | Pending audit | Pending | Support platform variants, multiple destinations, titles, captions, first comments, and source linkage |
| Scheduled repost | No canonical decision confirmed in existing source evidence | Pending audit | New SocialOlla requirement | New occurrence linked to source content; independent schedule, destination jobs, idempotency, evidence, and edits |
| First comment | Pending audit | Pending audit | New/verified adapter capability | Store per destination; block unsupported platforms; define failure/retry policy |
| Asset/media | R2 direction, source media, render contracts, fingerprints | Pending audit | Pending | Preserve source references, object keys, MIME/dimensions/duration, fingerprint, retention, and privacy |
| Delivery job | H5 state machine and provider-free evidence | Publishing implementation pending audit | H5 is current candidate | Independent job per destination; retries, lease/claim, cancellation, reconciliation, evidence, duplicate prevention |
| Watch profile | No primary implementation identified | Saved competitors and public-profile snapshots | SocialOreo is current candidate | Remove hard-coded commercial assumptions; preserve opt-in, ownership, source URL, capture time, retry, and cost estimate |
| Watch analysis | Pending audit | Basic/competitor reporting pending audit | Pending | Implement Basic Profile Analysis contract and higher-credit products separately |
| Plan | Historical/private workflow configuration pending audit | Existing Monthly/Square logic | New versioned plan model | Lifetime/monthly/annual/promotional plans, feature snapshots, grandfathering, scheduled changes |
| Entitlement | Pending audit | Existing plan gating pending audit | Server-authoritative versioned entitlements | Channel, posting, connection, AI, Watch, credit, and add-on controls |
| Monthly credits | Pending audit | Pending audit | New configurable system | Immediate initial grant, signup-anniversary reset, expiry, next-cycle allowance changes |
| Purchased credits | Pending audit | Pending audit | New universal batch ledger | 12-month expiry, non-transferable, non-cash-refundable, earliest-expiry consumption |
| Credit transaction | Pending audit | Pending audit | New hold/finalize/refund ledger | Idempotent action job, source allocation, cost preview, confirmation, automatic provider/system refund |
| Admin configuration | Existing settings pages pending audit | Existing admin/billing UI pending audit | New versioned Pricing & Features control plane | Draft, preview, confirmation, effective date, global/user overrides, audit, rollback |
| Audit event | Delivery audit transitions exist | Watch/payment audit behavior pending audit | Append-only safe audit model | No secrets/raw provider payloads; record actor, action, subject, safe metadata, timestamps |
| Provider credential | Mock vault and metadata interfaces | Pending audit | Encrypted external/server-side reference | Exact workspace/destination binding, rotation, revocation, least privilege, no logs/UI/repo secrets |
| Deployment | Existing VPS/RSS/feed/media dependencies | Public snapshot omits deployment details | Pending | Parallel staging, old endpoints retained, backup, smoke tests, rollback, explicit cutover approval |

## Proposed canonical record additions

These additions are required by confirmed product decisions even if neither source
repository currently provides them completely.

### Repost occurrence

```text
repost_occurrence
- id
- workspace_id
- source_post_id
- scheduled_at
- created_by
- status
- created_at
- updated_at
```

Each occurrence creates independent destination delivery jobs. It must not reuse a
completed job's idempotency key.

### First comment

```text
post_first_comment
- id
- workspace_id
- post_id
- destination_id
- body
- capability_state
- delivery_state
- provider_reference
- failure_reason_safe
- created_at
- updated_at
```

The final delivery/failure semantics remain pending product confirmation.

### Plan version and entitlement snapshot

```text
plan_version
- id
- plan_key
- version
- price
- currency
- effective_at
- configuration
- status

account_entitlement_snapshot
- id
- account_id
- plan_version_id
- configuration_snapshot
- activated_at
- status
```

### Credit batch and ledger

```text
credit_batch
- id
- account_id
- source_type
- original_amount
- remaining_amount
- granted_at
- expires_at
- status

credit_transaction
- id
- account_id
- action_job_id
- transaction_type
- amount
- batch_allocations
- feature_key
- provider_cost_estimate
- failure_reason_safe
- created_at
```

## Migration execution template

Every approved migration must record:

```text
Domain:
Selected source:
Source tables/files/modules:
Target tables/files/modules:
Compatibility adapter:
Data transformation:
Backfill:
Validation query/test:
Isolation test:
Idempotency test:
Failure test:
Backup:
Rollback command:
Owner:
PR:
Exact head:
CI:
Post-merge verification:
```

## Required migration gates

- no production mutation before backup and explicit approval;
- migrations must be reversible or have a tested restore procedure;
- no user, workspace, destination, entitlement, credit, or delivery record may be
  reassigned by display name alone;
- external account IDs and provider references must be treated as platform-scoped;
- timestamps and source identities must be preserved;
- duplicate publishing must be prevented during dual-running or cutover;
- historical lifetime entitlements must be stored as immutable snapshots;
- failed credit migration must not silently reduce a user's balance;
- source repositories and old deployments remain available until acceptance and
  rollback windows close.

## Next update

Complete the source columns and select canonical targets only after SocialOreo PR
#4 merges and both current repositories are audited from exact `main` SHAs.
