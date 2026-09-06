# Incident Response & DR Drill

## Incident response

1. Detect and open an incident with UTC timestamp and severity.
2. Assign incident lead, technical lead, and communications owner.
3. Contain the affected surface (API, rewards, withdrawals, payout, webhook, or infrastructure) without deleting evidence.
4. Preserve sanitized logs, request IDs, audit events, security events, and relevant resource IDs.
5. Rotate compromised credentials through the secret manager when compromise is suspected. Never paste secrets into tickets.
6. Restore service using the deployment/restore runbook when required.
7. Reconcile all financial state before reopening affected operations.
8. Document impact, root cause, RPO/RTO achieved, and corrective actions.

## DR drill procedure

Run a controlled drill at least periodically and after material changes to backup/recovery automation:

1. Announce a maintenance/drill window.
2. Select a recent verified backup without touching the production database.
3. Restore it into an isolated recovery environment.
4. Verify checksum and PostgreSQL restore success.
5. Start the API against the recovered database with non-production credentials/configuration.
6. Verify API health/readiness, Redis connectivity, queue behavior, and read-only critical flows.
7. Validate coin ledger, wallet, withdrawal, payout, and webhook invariants.
8. Measure elapsed restore time and calculate effective RPO from backup timestamp.
9. Record failures and remediation tasks.
10. Destroy the isolated drill environment securely after evidence is retained.

The drill must not connect to real payout providers or production financial infrastructure.
