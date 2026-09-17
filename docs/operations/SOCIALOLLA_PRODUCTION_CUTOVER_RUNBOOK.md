# SocialOlla Production Release Preflight and Rollback

**Status:** Source-only operational procedure. This document does not authorize
production deployment, provider activation, worker activation, migration
execution, or database mutation.

## Scope and safety boundary

The release checks in this change are read-only. They validate a candidate
release and an already-completed current/previous switch; they never create,
replace, remove, chmod, or restart anything. They do not invoke Next.js, a
worker engine, Prisma, PostgreSQL, Square, Meta, Instagram, Watch, or any other
provider.

Production provider activation remains a separate owner-authorized gate. Set
`SOCIALOLLA_PROVIDER_DISABLED=true` explicitly while using these checks; an
unset or other value fails closed. The staging worker guards and existing
Post/Watch engines are not changed by this procedure.

## Release layout

Use one application root with immutable, full-SHA release directories:

```text
/srv/socialolla/
  releases/
    <40-character-git-sha>/
      package.json
      node_modules/
      .next/BUILD_ID
      release-manifest.json
  current -> releases/<active-sha>
  previous -> releases/<rollback-sha>
```

`current` and `previous` must be symbolic links to different direct children of
`releases`. Do not point either link outside that directory. A release manifest
is created as part of the separately authorized release-build process and has
this shape; it contains no credentials:

```json
{
  "revision": "<40-character-git-sha>",
  "environment": "production",
  "buildTimestamp": "<ISO-8601 timestamp>"
}
```

The candidate preflight also requires the release to identify itself as the
SocialOlla application, contain a non-empty Next build marker, and contain its
own production dependencies. It compares the manifest revision and timestamp
with the deployment environment values, so an operator cannot accidentally
preflight one release while naming another.

## Candidate preflight

Run this from the candidate release environment after the separately approved
build has completed. All configured paths must be absolute, must not contain
`..` parent-traversal components, and must not traverse symlinked parent
components:

```text
NODE_ENV=production \
SOCIALOLLA_ENV=production \
SOCIALOLLA_PROVIDER_DISABLED=true \
SOCIALOLLA_RELEASES_DIR=/srv/socialolla/releases \
SOCIALOLLA_RELEASE_DIR=/srv/socialolla/releases/<candidate-sha> \
SOCIALOLLA_CURRENT_LINK=/srv/socialolla/current \
SOCIALOLLA_PREVIOUS_LINK=/srv/socialolla/previous \
SOCIALOLLA_REVISION=<candidate-sha> \
SOCIALOLLA_BUILD_TIMESTAMP=<manifest-timestamp> \
npm run production:release:preflight
```

The command succeeds only when:

1. the candidate is a non-symlink directory named by a full 40-character Git
   SHA directly below `releases`;
2. its manifest, `package.json`, `node_modules`, and `.next/BUILD_ID` are
   present and consistent;
3. production identity is explicit and provider-disabled mode is still in
   force;
4. `current` and `previous` are existing symbolic links to different release
   directories; and
5. the candidate differs from `current`.

The JSON result deliberately reports only release identities and action status.
It reports `databaseAction` and `providerAction` as `not-performed`.

## Atomic cutover sequence

This is an operator procedure, not an action performed by the preflight
command. Before using it, obtain the separate production deployment gate,
complete the approved backup/migration plan, and confirm the exact candidate
preflight result.

1. Resolve and record the current target with `readlink -f`.
2. Create a temporary symlink in the same directory as `previous` pointing to
   the recorded current target, then replace `previous` with `mv -Tf`.
3. Create a temporary symlink in the same directory as `current` pointing to
   the candidate target, then replace `current` with `mv -Tf`.
4. Validate the public health response and its exact `revision` before treating
   the release as active.
5. Keep the old release directory and the `previous` link until the owner
   approves retention cleanup.

The temporary link names must be unique to the operation and must be removed
if the operation is interrupted. Never use a recursive delete or replace a
release directory in place. A failed second `mv` leaves the old `current` link
active; stop and investigate before retrying.

## Post-switch and rollback verification

The rollback verifier performs one bounded, unauthenticated HTTPS `GET` to the
configured `/api/health` endpoint. It does not accept a caller-supplied health
file, cookies, authorization headers, environment output, or database URLs.
The response must identify `service=socialolla`, `environment=production`,
`ok=true`, and the exact active revision.

```text
NODE_ENV=production \
SOCIALOLLA_ENV=production \
SOCIALOLLA_PROVIDER_DISABLED=true \
SOCIALOLLA_RELEASES_DIR=/srv/socialolla/releases \
SOCIALOLLA_CURRENT_LINK=/srv/socialolla/current \
SOCIALOLLA_PREVIOUS_LINK=/srv/socialolla/previous \
SOCIALOLLA_EXPECTED_CURRENT_REVISION=<active-sha> \
SOCIALOLLA_EXPECTED_PREVIOUS_REVISION=<rollback-sha> \
SOCIALOLLA_PRODUCTION_ORIGIN=https://<approved-production-origin> \
APP_BASE_URL=https://<same-approved-production-origin> \
npm run production:rollback:verify
```

This verifier checks the exact current/previous pair, that both targets remain
inside `releases`, that both target manifests are present and match their
SHA-named directories, and that the health revision and build timestamp equal
`current`. It does not
change the links, follow redirects, send credentials, or infer database state
from an application rollback. The health endpoint must use HTTPS, contain no
credentials/query/fragment, and is constructed as `/api/health` from the
owner-approved `SOCIALOLLA_PRODUCTION_ORIGIN`. `APP_BASE_URL` must match that
origin exactly; this prevents a caller from substituting an arbitrary host or
health file for the configured production service.

If health verification fails after a cutover, stop provider/payment/worker
activation and perform an owner-authorized application rollback by atomically
pointing `current` to the known-good `previous` target. Then run the verifier
with the old active SHA as `SOCIALOLLA_EXPECTED_CURRENT_REVISION` and the failed
candidate SHA as `SOCIALOLLA_EXPECTED_PREVIOUS_REVISION`.

## Database and migration boundary

Application release rollback and database rollback are separate operations.
Changing `current` never rolls back PostgreSQL schema or data. Do not use
`prisma migrate reset`, drop/recreate commands, or an unreviewed down migration
as a rollback mechanism.

Before any separately authorized schema change, the deployment owner must
complete a read-only migration-status check against the intended database,
confirm the exact migration set, create and verify the encrypted backup using
the existing `npm run db:backup` capability, and prove a disposable restore
drill. Run `prisma migrate deploy` only under that separate gate. If the schema
cannot support the previous application, stop application rollback and use the
approved encrypted-backup restore procedure against an isolated target before
considering any production recovery action.

The release preflight and rollback verifier intentionally do none of these
database operations.

## Required follow-up gates

This change does not prove:

- an installed production web service or Post/Watch service/timer;
- production Meta or Square configuration;
- live provider activation;
- off-VPS backup retention, monitoring, key recovery, or a completed restore
  drill; or
- DNS, payment, customer migration, or production health in the real
  environment.

Those remain separate owner-gated work items. Keep old releases and rollback
paths until the corresponding runtime and recovery evidence has been reviewed.
