# Restore Procedure

## Scope

This runbook restores Rewzio PostgreSQL data and service configuration after data loss or an infrastructure failure. It is a controlled operational procedure; production credentials are supplied only by the approved secret manager/GitHub Environment and are never written here.

## Recovery sequence

1. Declare the incident and assign an incident lead.
2. Freeze risky financial operations if integrity is uncertain.
3. Identify the latest verified PostgreSQL backup and its checksum.
4. Verify the backup checksum.
5. Restore into an isolated database first and run application/readiness checks.
6. Validate critical tables and financial invariants (coin ledger, wallets, withdrawals, payouts, webhook state).
7. If the isolated restore is valid, restore/promote the recovery database according to the hosting provider's controlled procedure.
8. Restore Redis only from operationally supported snapshots if available; otherwise rebuild ephemeral/cache state from PostgreSQL and application sources. Never treat Redis as the authoritative financial ledger.
9. Start the API with production configuration injected from the secret manager.
10. Confirm `/api/v1/health` and `/api/v1/ready`, then run smoke tests.
11. Re-enable financial operations only after reconciliation and incident-lead approval.
12. Record actual RPO/RTO and follow up with corrective actions.

## Secondary recovery plan

Maintain a separate recovery location/account and an independently accessible backup copy. If the primary database host is unavailable, restore the latest verified backup to the secondary PostgreSQL environment and point the service deployment at it using the normal protected deployment mechanism.

## Post-restore checks

- API health/readiness is stable.
- Redis connectivity is healthy.
- Queue processing is healthy or safely paused.
- Withdrawal/payout states reconcile with provider records.
- Webhook replay/idempotency remains intact.
- No duplicate coin movements were introduced.
- Audit/security logs are available.

RPO 15–60 minutes and RTO 1–4 hours are design targets only, not SLA guarantees.
