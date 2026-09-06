# Configuration & Critical Metadata Backup

Configuration backups must be reproducible without placing secret values in Git.

## Include

- deployment manifests and environment names;
- non-secret runtime configuration and feature-flag state;
- reward/limit configuration that is required to reconstruct operational behavior;
- provider identifiers and integration metadata, excluding credentials;
- backup/restore run metadata and verification timestamps;
- references to the approved secret manager entries.

## Exclude

Never export passwords, OTP secrets, JWT signing keys, API keys, provider secrets, session secrets or raw personal/payment data into repository backups.

## Storage

Store encrypted configuration snapshots in the approved backup system with restricted access, versioning/immutability where supported, retention policy and an independent recovery copy.

## Verification

After each material backup automation change, restore a configuration snapshot in an isolated recovery environment and confirm that the service can be reconstructed using secret-manager references supplied separately by authorized operators.
