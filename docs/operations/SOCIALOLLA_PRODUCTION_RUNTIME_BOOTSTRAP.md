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
contained relative npm link to that executable, read-only file. The same
preflight also allows Next.js runtime symlinks below
`.next/node_modules/**`, but only when each link has a relative target, the
target exists, and its canonical resolution remains inside this candidate's
root `node_modules`. Normalized `..` components may not escape the candidate;
absolute targets, broken links, symlinked path components, and targets outside
root `node_modules` are rejected. `.bin` links must resolve to regular files
matching the owning package's declared `bin` entry. For Next runtime links,
the preflight requires existence and containment but adds no separate target
file-type check. Every other release symlink is rejected. All regular files
and directories remain read-only, and preflight inspects rather than changing
permissions. See the cutover runbook for the complete tested contract.
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
environment alone does not enable either worker. Provider-disabled mode is the
safe default for a new, inactive installation. It is not a universal live
state: the existing production Watch operation requires
`SOCIALOLLA_PROVIDER_DISABLED=false` together with its Watch worker and Watch
provider gates. Preserve the current live values during an existing-release
cutover; do not apply the new-install defaults to a live Watch deployment. The
preflight's `SOCIALOLLA_PROVIDER_DISABLED=true` is process-scoped to that check
and must not be copied into the shared production environment. Post publishing
separately requires the production Post worker gate, the exact
platform-specific `SOCIALOLLA_<PLATFORM>_PUBLISH_ENABLED=true` gate, and
`SOCIALOLLA_PROVIDER_DISABLED=false`; all ten publishing gates remain
independently fail-closed. Instagram's existing key remains
`SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED`. Production Watch provider execution
separately requires `SOCIALOLLA_PRODUCTION_WATCH_PROVIDER_ENABLED=true` and
`SOCIALOLLA_PROVIDER_DISABLED=false`; that path is Instagram-only. TikTok
production execution is disabled. It remains hard-disabled by the provider
factory, regardless of its environment gate.

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
- For a new, inactive installation only, keep production worker enable flags
  absent or set to a value other than exact `true`, and keep providers
  disabled. For an existing deployment with live Watch, preserve the observed
  worker/provider values instead; use the Watch-preserving cutover plan in the
  production cutover runbook.

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
- Inventory the exact worker/provider and platform gates from the intended
  external environment by key and boolean state only; never print secrets. A
  new inactive deployment must meet the fail-closed defaults. An existing live
  Watch deployment must retain its current global provider, Watch worker,
  Watch provider, and timer values as specified in the cutover runbook.
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
Installing or enabling a unit is never implied by this source change. For a
new inactive installation, keep Post and Watch timers inactive until the owner
explicitly authorizes each worker and its operational checks. For a release
replacement where Watch is already live, do not pause, stop, disable, or
restart its worker/timer, and do not change its worker/provider flags during
the web cutover. Preserve the existing global provider value required by Watch;
the preflight's provider-disabled override is not the live environment state.
A worker flag alone is not a provider authorization, and every Post publishing
gate must remain false or absent for the Watch-preserving cutover. Inventory
connection gates read-only and do not start OAuth as part of release cutover.

Instagram publishing and OAuth retain the separate Instagram publishing and
provider gates. Watch live execution has the separate production Watch provider
gate and remains unavailable for TikTok. Square, credentials, DNS, pricing,
and all other external integrations are outside this bootstrap.
