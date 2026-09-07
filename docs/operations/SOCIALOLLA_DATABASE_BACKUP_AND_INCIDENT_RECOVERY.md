# SocialOlla Database Backup and Customer-Incident Recovery

**Status:** Repository capability only. Nothing in this document means backups are active on staging or production.

## What this protects

Two different systems are required:

1. **Encrypted database backups** recover durable application data after database loss or corruption.
2. **Privacy-minimized incident and session events** help support reconstruct which account, role, route, environment, and release were involved in a customer-visible failure.

Logs are not backups. A backup stored only on the application VPS is not sufficient disaster recovery.

## Customer incident evidence

The authenticated application error boundary sends only:

- a random client event UUID used for idempotency;
- the URL pathname without query parameters;
- the framework error digest when it matches the safe allow-list.

The server derives the canonical account, workspace, and `USER`/`ADMIN` role from the verified session and database. It writes `CUSTOMER_ERROR_OBSERVED` to the existing `AuditEvent` table and returns an opaque `INC-XXXXXXXXXX` reference to the customer.

The admin-only `/admin/incidents` view correlates the reference with the canonical account and role-at-incident. Existing `/admin/sessions` remains the separate authentication-session timeline.

The incident event does not store raw error messages, stack traces, Auth0 subjects in the UI, tokens, cookies, request bodies, query strings, IP addresses, or user-agent strings. Incident reporting failure never prevents the customer from retrying.

No automatic incident-retention policy is introduced here. Retention and deletion must be approved at the privacy/security production gate before activation.

## Backup artifact

`npm run db:backup` streams `pg_dump --format=custom` directly through AES-256-GCM. It never writes a plaintext dump. Successful output consists of:

- `socialolla-postgres-<UTC timestamp>-<random>.dump.enc`
- the adjacent `.manifest.json` containing format version, byte count, creation time, and SHA-256 checksum

Partial files are private and removed on failure. The script never prints database URLs or encryption keys.

Required environment variables:

```text
DATABASE_URL=<existing SocialOlla PostgreSQL connection URL>
SOCIALOLLA_BACKUP_DIR=/mnt/socialolla-backups
SOCIALOLLA_BACKUP_KEY_FILE=/srv/socialolla/config/socialolla-database-backup.key
```

The key file must contain exactly 32 random bytes encoded as hexadecimal or base64 and must be readable only by its owner. Generate and store it outside the repository and outside the backup destination. Do not copy it into issue bodies, logs, chat, Git, or the backup manifest.

The example systemd service refuses to run unless `/mnt/socialolla-backups` is a mount point. Operations must back that mount with storage outside the application VPS and define retention/versioning there. Installing or enabling the example service requires separate server/deployment authorization.

## Restore drill

A backup is not accepted until it restores successfully into a disposable, isolated database.

Required variables in addition to the backup key and source `DATABASE_URL`:

```text
SOCIALOLLA_RESTORE_DATABASE_URL=<pre-created disposable PostgreSQL database>
SOCIALOLLA_RESTORE_CONFIRM=RESTORE_TO_DISPOSABLE_DATABASE
SOCIALOLLA_RESTORE_TEMP_DIR=/secure/private/temp
```

Run:

```text
npm run db:restore:drill -- /absolute/path/to/socialolla-postgres-...dump.enc
```

The restore command:

1. refuses a target that resolves to the source host, port, and database;
2. requires the exact disposable-restore confirmation phrase;
3. verifies the artifact byte count and SHA-256 manifest;
4. decrypts into a mode-`0600` temporary file and verifies the AES-GCM authentication tag before `pg_restore` can mutate the disposable target;
5. uses `pg_restore --exit-on-error`; and
6. removes the decrypted temporary directory whether the drill succeeds or fails.

The disposable database must already exist and must not accept production traffic. After restoration, separately verify migration history, representative row counts, required foreign keys, and application read-only health. Record the artifact checksum, restore time, result, and operator without recording credentials or customer content.

## Activation gate

Before calling database recovery operationally complete, require evidence for all of the following:

- the destination is outside the application VPS;
- scheduled encrypted backups are enabled and monitored;
- failed backup notification reaches an authorized operator;
- retention/versioning is approved and active;
- the encryption key has a separately protected recovery copy;
- at least one fresh artifact passed a disposable restore drill;
- no credentials or customer content appeared in logs; and
- rollback/disabling instructions for the timer are documented for the actual environment.

This repository change does not perform or authorize any staging or production backup, restore, package installation, systemd change, deployment, or database mutation.
