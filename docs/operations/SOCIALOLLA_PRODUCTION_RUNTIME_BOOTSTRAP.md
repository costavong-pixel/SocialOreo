# SocialOlla Production Runtime Bootstrap

**Status:** Repository definitions and operator guidance only. Nothing in this
document authorizes deployment or performs a production action.

The production units under `deploy/production/` are inert files until an
operator separately installs and activates them. The web unit uses the
versioned `/srv/socialolla/current` path. All services load their environment
from `/srv/socialolla/shared/production.env`; that file must remain outside the
immutable release tree. No secret values belong in this repository, and this
bootstrap never creates or populates the environment file.
Each service command explicitly passes `NODE_ENV=production` and
`SOCIALOLLA_ENV=production` to the existing npm command. Keep environment
identity in the unit command; use the shared file for the external application
and provider configuration.

The web service runs the existing `npm run start` command and restarts after an
unexpected failure. The Post and Watch one-shot services call the existing
`post-worker:once` and `watch-worker:once` commands; their timers only schedule
those existing engines. Leases, retries, idempotency, reconciliation, Watch
credit holds/finalization/refunds, and settlement recovery remain in those
engines.

The existing worker commands use `tsx`, which is shipped as a production
dependency. Before any operator-controlled activation, the release preflight
must confirm that `node_modules/tsx/package.json` identifies `tsx`, that its
declared runtime file is present, and that `node_modules/.bin/tsx` is a
contained relative npm link to that executable, read-only file. No other
release symlink is allowed; the check is read-only and never changes release
permissions.
The `/srv` systemd target is a Linux release tree, so Windows npm `.cmd` and
`.ps1` shims are not accepted as production runtime entries.

Production worker gates are intentionally absent from the unit files and must
not be enabled during preparation or qualification:

```text
SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED=true
SOCIALOLLA_PRODUCTION_WATCH_WORKER_ENABLED=true
```

Only the exact lowercase string `true` enables its corresponding worker. Both
`NODE_ENV` and `SOCIALOLLA_ENV` must be exactly `production`. A production
environment alone does not enable either worker. Provider-disabled mode remains
the safe default. Post publishing separately requires
`SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED=true` and
`SOCIALOLLA_PROVIDER_DISABLED=false`. Production Watch provider execution
separately requires `SOCIALOLLA_PRODUCTION_WATCH_PROVIDER_ENABLED=true` and
`SOCIALOLLA_PROVIDER_DISABLED=false`; that path is Instagram-only. TikTok
production execution is disabled.

## PREPARE

- Build and qualify a release from the reviewed source in an isolated build
  environment. The release directory name must follow the production
  preflight's `<40-character-sha>-<timestamp>` contract.
- An operator may prepare `/srv/socialolla/releases/` and
  `/srv/socialolla/shared/` only under a separate production authorization.
  First inspect `/srv/socialolla` and each exact target without following
  symlinks. Create only absent `releases` and `shared` directories as
  `socialolla:socialolla` with mode `0750`; use non-recursive
  creation so an existing target fails instead of being rewritten. Stop if a
  target exists with an unexpected type, owner, or mode—do not recursively
  chmod/chown or replace it.
  Keep `/srv/socialolla/shared/production.env` outside `releases/`; do not
  generate, print, commit, or copy secret values into this repository. Verify
  that the externally provisioned env file is owned by `socialolla` and mode
  `0600`; if it is absent or unsafe, stop for the separate credential process.
- Verify the `socialolla` service account and runtime prerequisites through
  the approved infrastructure process. Do not migrate the database or change
  `current`/`previous` symlinks during preparation.
- Keep the production worker enable flags absent or set to a value other than
  exact `true`. Keep providers disabled.

## QUALIFY

- Review the candidate release and unit definitions without installing or
  activating services. The web and worker services must resolve through
  `/srv/socialolla/current` and load the external shared environment file.
- Confirm the candidate passes the release preflight's contained `tsx` runtime
  check. A missing runner, missing runtime entry, broken npm binary, or a link
  outside that release's `node_modules` is a qualification failure.
- For the first release, run the read-only production release preflight in
  `FIRST_DEPLOY` mode. It permits absent `current` and `previous` links and
  reports `rollbackAvailable=false`; it does not create or change either link.
- Confirm provider-disabled defaults and the exact worker/provider gates from
  the intended external environment without printing its contents.
- Do not start worker engines as a qualification shortcut. Unit tests and the
  existing staging tests exercise the definitions and guards without making
  production calls or database changes.

## OWNER-AUTHORIZED CUTOVER

This is a separate, explicit owner gate. Only after the release, backup and
database compatibility plans, service identity, and first-deployment
preflight have been reviewed may an authorized operator install the unit files
and perform the separately approved `current`/`previous` symlink transition.
The first deployment has no application rollback target. The second release
must preserve the first as `previous` before rollback is reported available.

This repository does not install units, switch links, start services, or run a
database migration. Database migration and application cutover remain separate
operator-controlled procedures.

## ACTIVATE

Web, worker, and provider activation are separate owner-authorized actions.
Installing or enabling a unit is never implied by this source change. Keep the
Post and Watch timers inactive until the owner explicitly authorizes each
worker and its operational checks. Set the matching exact production worker
flag only for an authorized worker activation. Leave provider-disabled mode
enabled until a separate provider approval; a worker flag alone is not a
provider authorization.

Instagram publishing and OAuth retain the separate Instagram publishing and
provider gates. Watch live execution has the separate production Watch provider
gate and remains unavailable for TikTok. Square, credentials, DNS, pricing,
and all other external integrations are outside this bootstrap.
