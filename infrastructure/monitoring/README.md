# Monitoring & Operational Reliability

This directory defines the operational monitoring baseline for Rewzio.

## Signals

| Area | Signal | Severity guidance |
|---|---|---|
| API | `/api/v1/health` and `/api/v1/ready` availability/latency | Critical when unavailable |
| PostgreSQL | connection failures, query latency, pool exhaustion, disk/replication health | Critical when unavailable |
| Redis | connection failures, latency, memory/evictions | High/Critical when unavailable |
| Queue | backlog, oldest item age, processing failures | High when backlog grows continuously |
| Payout | pending/failed/retry counts and provider latency | High for sustained failures |
| Webhook | invalid signatures, duplicate/replay rate, processing failures, backlog | High for sustained failures |
| Rewards | rejected/failed/reversed reward rate and unusual spikes | High when anomalous |
| Fraud | high-risk score/action spikes and review backlog | High when anomalous |
| Withdrawals | failed, pending-review, capacity-pending and rejection rates | High when anomalous |

## Logging requirements

Application logs must remain structured and include request/correlation identifiers where available. Security and audit events should be separately searchable.

Never log passwords, OTP values, JWTs, API keys, provider secrets, refresh tokens, or unnecessary sensitive personal data. Provider payloads must be redacted before persistence/logging.

## Alerting baseline

Alert on:

- API health/readiness failures.
- Database or Redis connectivity failures.
- Queue backlog/age thresholds.
- Payout and withdrawal failure-rate spikes.
- Webhook signature failures or processing backlog.
- Reward failure/reversal spikes.
- Fraud high-risk spikes.

Thresholds are environment-specific and must be configured in the external monitoring system; no production credentials or provider integrations are stored in this repository.

## Operational review

During an incident, preserve request IDs, timestamps, affected resource IDs, and sanitized error codes. Do not copy secrets or raw sensitive payloads into tickets or chat.
