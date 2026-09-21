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

Use one application root with immutable, timestamped release directories and a
separate shared environment file:

```text
/srv/socialolla/
  releases/
    <40-character-git-sha>-<UTC-timestamp>/
      package.json
      node_modules/
      .next/BUILD_ID
      release-manifest.json
  shared/
    production.env
  current -> releases/<active-release-directory>
  previous -> releases/<rollback-release-directory>
```

The release directory prefix is independently validated as an exact,
case-insensitive 40-character hexadecimal Git SHA. The recommended path-safe
timestamp suffix is `YYYY-MM-DDTHH-mm-ss.sssZ`; it must identify the same instant
as the manifest `buildTimestamp`. A legacy bare `<sha>` directory remains
accepted for an existing release, but new releases should use the timestamped
form. `current` and `previous` must be symbolic links to different direct
children of `releases` whenever rollback is available. Do not point either link
outside that directory.

`/srv/socialolla/shared/production.env` must be an existing regular file outside
`releases`. A release must not contain `production.env` at its root or below;
the preflight never reads or prints its contents. A release is immutable before
qualification: every entry must be a regular file or directory with no write
permission bits. The only permitted exception is a direct npm runtime symlink
inside a `node_modules/.bin` directory. Each such link must be relative, must
resolve to a regular file inside the same release's `node_modules`, and must
match its owning package's declared `bin` entry. Broken, absolute, escaping, or
unrelated release symlinks fail closed. The preflight verifies that contract
using read-only filesystem inspection; it never changes permissions.

A release manifest is created as part of the separately authorized
release-build process and has this shape; it contains no credentials:

```json
{
  "revision": "<40-character-git-sha>",
  "environment": "production",
  "buildTimestamp": "<ISO-8601 timestamp>"
}
```

The candidate preflight also requires the release to identify itself as the
SocialOlla application, contain a non-empty Next build marker, and contain its
own production dependencies. In particular, `tsx` must be a production
dependency, its `node_modules/tsx/package.json` must identify `tsx`, and its
contained `node_modules/.bin/tsx` entry must resolve to the declared runtime
file used by the Post and Watch npm commands; that runtime file must be
executable without being writable. It compares the manifest revision and
timestamp with the deployment environment values and timestamped directory
name, so an operator cannot accidentally preflight one release while naming
another.

## Candidate preflight

Run this from the candidate release environment after the separately approved
build has completed. All configured paths must be absolute, must not contain
`..` parent-traversal components, and must not traverse symlinked parent
components. The command uses the fixed shared secret path
`/srv/socialolla/shared/production.env`:

```text
NODE_ENV=production \
SOCIALOLLA_ENV=production \
SOCIALOLLA_PROVIDER_DISABLED=true \
SOCIALOLLA_RELEASES_DIR=/srv/socialolla/releases \
SOCIALOLLA_RELEASE_DIR=/srv/socialolla/releases/<candidate-sha>-<timestamp> \
SOCIALOLLA_CURRENT_LINK=/srv/socialolla/current \
SOCIALOLLA_PREVIOUS_LINK=/srv/socialolla/previous \
SOCIALOLLA_REVISION=<candidate-sha> \
SOCIALOLLA_BUILD_TIMESTAMP=<manifest-timestamp> \
npm run production:release:preflight
```

The command succeeds only when:

1. the candidate is a non-symlink, read-only directory named by a full
   40-character Git SHA with an optional validated timestamp suffix directly
   below `releases`;
2. its manifest, `package.json`, `node_modules`, and `.next/BUILD_ID` are
   present and consistent, including the contained `tsx` worker runtime;
3. production identity is explicit and provider-disabled mode is still in
   force;
4. `current` and `previous` are existing symbolic links to different release
   directories; and
5. the candidate differs from `current`.

The normal JSON result reports `rollbackAvailable=true` only after the strict
current/previous pair passes. It deliberately reports only release identities
and action status; `databaseAction` and `providerAction` are
`not-performed`.

## First deployment transition (`FIRST_DEPLOY`)

The first deployment has no rollback target. Run the explicit bootstrap mode
against the timestamped candidate while both `current` and `previous` are
absent:

```text
NODE_ENV=production \
SOCIALOLLA_ENV=production \
SOCIALOLLA_PROVIDER_DISABLED=true \
SOCIALOLLA_RELEASE_CHECK_MODE=FIRST_DEPLOY \
SOCIALOLLA_RELEASES_DIR=/srv/socialolla/releases \
SOCIALOLLA_RELEASE_DIR=/srv/socialolla/releases/<first-sha>-<timestamp> \
SOCIALOLLA_CURRENT_LINK=/srv/socialolla/current \
SOCIALOLLA_PREVIOUS_LINK=/srv/socialolla/previous \
SOCIALOLLA_REVISION=<first-sha> \
SOCIALOLLA_BUILD_TIMESTAMP=<manifest-timestamp> \
npm run production:release:preflight
```

The successful result has `mode=first-deploy`,
`deploymentMode=FIRST_DEPLOY`, and `rollbackAvailable=false`. It does not
create either link. Under the separate production cutover authorization, point
`current` to the first release and leave `previous` absent. Do not claim an
application rollback path at this stage; database recovery remains separate.

`FIRST_DEPLOY` also covers the second-release preparation while the first
release is active and `previous` is still absent. It validates the active
`current` target, rejects any invalid/broken/out-of-root `previous` target, and
continues to report `rollbackAvailable=false`.

## Second deployment transition and rollback availability

For the second release, run `FIRST_DEPLOY` against the second candidate while
the first release is `current` and `previous` is absent. Under the separate
cutover authorization, atomically promote the second release and set
`previous` to the first release. After the switch, the required state is:

```text
current  -> releases/<second-sha>-<timestamp>
previous -> releases/<first-sha>-<timestamp>
```

The two links must be distinct, read-only release directories. Run the
post-switch verifier with the exact pair and the public health check. Only
after that verifier passes is `rollbackAvailable=true`; an owner-authorized
rollback may then point `current` back to `previous` while preserving both
release directories. From the third release onward, use the normal candidate
preflight, which keeps strict validation of both links and refuses an absent or
invalid `previous` target.

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
