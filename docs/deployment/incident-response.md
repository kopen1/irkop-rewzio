# Rewzio — Incident Response

**Purpose:** Production incident handling for controlled launch and later operation.

## Severity 1 — Critical Financial/Security Incident

Examples:

- ledger inconsistency;
- duplicate reward issuance;
- duplicate withdrawal/payout;
- invalid or replayed webhook affecting financial state;
- confirmed credential/secret exposure;
- systemic fraud or abuse;
- provider payout failure with financial impact;
- database corruption or unrecoverable production failure.

### Immediate Response

1. **Kill Switch** — activate the narrowest applicable kill switch.
2. **Freeze** — freeze suspicious rewards and/or withdrawals.
3. **Preserve Logs** — preserve API, audit, ledger, payout, webhook, fraud, database and infrastructure evidence.
4. **Investigate** — identify affected users, transactions, time window and systems.
5. **Patch** — prepare the smallest safe correction.
6. **Test** — run unit, integration, E2E, security and staging validation as applicable.
7. **Resume** — resume only after validation and explicit authorization.

## Financial Safety Rules

- Never repair a ledger by rewriting historical entries; use compensating entries.
- Do not manually mark payouts completed without provider evidence and reconciliation.
- Preserve provider references and webhook evidence.
- Idempotency must remain enabled during incident recovery.
- Do not bypass ownership or authorization checks for emergency operations.

## Incident Containment Controls

| Control | Emergency action |
|---|---|
| `reward_enabled` | OFF |
| `withdrawal_enabled` | OFF |
| `watch_enabled` | OFF if watch abuse is involved |
| `referral_enabled` | OFF if referral abuse is involved |
| `survey_enabled` | OFF if survey abuse is involved |
| `offerwall_enabled` | OFF if offerwall abuse is involved |
| `maintenance_mode` | ON for broad application outage |
| `emergency_restriction` | ON for systemic/critical incident |

Use the narrowest control that safely contains the incident.

## Fraud Incident

1. Increase scrutiny/adjust thresholds through the authorized configuration path.
2. Hold suspicious rewards or withdrawals.
3. Preserve device, IP, session, velocity, behavior, referral, reward, withdrawal and integrity signals.
4. Review related accounts/devices/transactions.
5. Do not treat IP alone as conclusive fraud evidence.
6. Record every security action in the audit trail.

## Payout / Webhook Incident

1. Stop new withdrawals if financial correctness is uncertain.
2. Do not blindly retry provider operations.
3. Use withdrawal ID, internal transaction ID, provider reference and idempotency key to determine state.
4. Verify webhook authenticity before processing.
5. Reconcile provider state against internal state.
6. Resolve discrepancies before resuming payout traffic.

## Database / Redis Incident

### Database

- Stop risky write flows if integrity is uncertain.
- Preserve database logs and timestamps.
- Verify ledger/account consistency.
- Follow the approved backup/restore procedure.
- Record recovery actions.

### Redis

- Treat Redis as a supporting control/cache layer, not the financial source of truth.
- Verify rate limits, locks and queues after recovery.
- Ensure financial state is consistent with PostgreSQL before resuming operations.

## Communication

Incident records should contain:

- incident ID;
- detected time;
- severity;
- affected service/features;
- affected transaction/user scope;
- containment action;
- operator;
- evidence preserved;
- root cause;
- patch/release;
- validation result;
- resume authorization;
- post-incident actions.

Do not put secrets, OTP codes, access tokens, full payment credentials or unnecessary personal data in incident reports.

## Recovery Checklist

- [ ] Incident contained.
- [ ] Relevant kill switch active.
- [ ] Suspicious financial flows frozen where necessary.
- [ ] Logs/audit evidence preserved.
- [ ] Ledger consistency verified.
- [ ] Withdrawal/payout state reconciled.
- [ ] Root cause identified or risk accepted by authorized owner.
- [ ] Patch reviewed.
- [ ] Automated tests pass.
- [ ] Staging validation passes.
- [ ] Monitoring/alerts operational.
- [ ] Rollback path verified.
- [ ] Resume authorized.
- [ ] Post-incident review scheduled.

## Controlled Launch Restriction

This runbook does not authorize production launch. Prompt 25 remains the release gate. If the Go-Live Gate is BLOCKED, production traffic must remain closed regardless of this runbook being implemented.
