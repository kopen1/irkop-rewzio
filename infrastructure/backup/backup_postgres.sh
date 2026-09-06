#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/rewzio-$STAMP.dump"
CHECKSUM_FILE="$BACKUP_FILE.sha256"

umask 077
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "$BACKUP_FILE"
sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"

echo "PASS: PostgreSQL backup created: $BACKUP_FILE"
echo "PASS: checksum created: $CHECKSUM_FILE"
