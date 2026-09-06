#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:?usage: verify_backup.sh <backup.dump> [sha256sums-file]}"
CHECKSUM_FILE="${2:-${BACKUP_FILE}.sha256}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ ! -f "$CHECKSUM_FILE" ]]; then
  echo "ERROR: checksum file not found: $CHECKSUM_FILE" >&2
  exit 1
fi

sha256sum -c "$CHECKSUM_FILE"
echo "PASS: backup checksum verified"
