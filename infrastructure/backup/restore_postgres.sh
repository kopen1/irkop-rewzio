#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:?usage: restore_postgres.sh <backup.dump>}":
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  sha256sum -c "${BACKUP_FILE}.sha256"
fi

pg_restore --clean --if-exists --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
echo "PASS: PostgreSQL restore completed"
