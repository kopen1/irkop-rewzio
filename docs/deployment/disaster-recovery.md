# Disaster Recovery & Incident Response

## Design targets

- RPO: 15–60 minutes.
- RTO: 1–4 hours.
- These are design targets, not SLA guarantees.

## Recovery priorities

1. PostgreSQL and financial ledger integrity.
2. Redis-dependent rate/idempotency controls.
3. API health/readiness and authenticated traffic.
4. Reward, withdrawal, payout and webhook processing.
5. Admin/support operations.
6. Non-critical notifications and analytics.

## Incident response

1. Declare an incident and assign an incident commander.
2. Record UTC start time, request IDs, affected services, sanitized error codes and current customer impact.
3. Protect financial integrity first: pause affected reward/withdrawal/payout paths when necessary; do not manually alter ledger balances.
4. Preserve relevant audit/security events without copying secrets or raw sensitive payloads into tickets.
5. Restore infrastructure from the latest verified recovery point.
6. Run health/readiness, database integrity, Redis connectivity and critical financial consistency checks.
7. Re-enable traffic gradually and monitor error/retry/replay rates.
8. Reconcile payouts/webhooks before declaring financial processing recovered.
9. Document timeline, root cause, impact, corrective actions and follow-up owners.

## Secondary recovery plan

If the primary runtime is unavailable, use the approved secondary recovery environment with:

- a separately stored, restore-tested PostgreSQL backup;
- versioned repository source and Prisma migrations;
- encrypted configuration snapshots without secret values;
- secret-manager references restored by authorized operators;
- a separate Redis instance rebuilt from configuration rather than treating Redis as the source of financial truth.

DNS/Cloudflare routing changes remain an external operational action and must not expose credentials in this repository.

## DR drill procedure

At least periodically and after material recovery changes:

1. Select a recent backup without using production data outside the approved recovery environment.
2. Verify its checksum.
3. Restore PostgreSQL into an isolated instance.
4. Verify schema, required tables, ledger invariants and representative application reads.
5. Recreate Redis and validate connectivity/rate-limit/idempotency primitives.
6. Start the API against the isolated recovery environment.
7. Execute health/readiness and critical non-destructive smoke checks.
8. Measure elapsed recovery time and recovered data age against the RTO/RPO targets.
9. Record failures and corrective actions.

Never run a restore drill against production without an explicit change/incident procedure and approved rollback plan.
