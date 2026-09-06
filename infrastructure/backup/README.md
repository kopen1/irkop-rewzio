# Backup & Restore

Backups are operational artifacts and are never committed to Git.

## PostgreSQL backup

Use PostgreSQL-native logical backups for portable recovery. Run from a trusted backup host with credentials supplied through the environment/secret manager:

```bash
mkdir -p backups
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "backups/rewzio-$(date -u +%Y%m%dT%H%M%SZ).dump"
sha256sum backups/*.dump > backups/SHA256SUMS
```

The backup destination must use encryption at rest, restricted access, retention, and immutable/versioned storage where supported.

## Configuration and critical metadata

Back up deployment configuration and operational metadata needed to reconstruct the service, but never commit secret values. Store encrypted configuration snapshots and secret-manager references in the approved backup system. Prisma migrations and repository source remain recoverable from Git.

## Verification

A backup is not considered verified until its checksum is checked and a restore is tested against an isolated PostgreSQL instance.

```bash
sha256sum -c backups/SHA256SUMS
createdb rewzio_restore_check
pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" backups/rewzio-YYYYMMDDTHHMMSSZ.dump
```

Run verification on a scheduled basis and after material changes to backup automation.

## Target design

- RPO target: 15–60 minutes.
- RTO target: 1–4 hours.
- These are design targets, not SLA guarantees.

## Retention

Define retention according to business/legal requirements. Keep at least one recent restore-tested copy and an independent recovery copy. Do not store backup credentials in repository files.
