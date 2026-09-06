# Monitoring Alert Baseline

The repository does not bind Rewzio to a specific commercial monitoring vendor. Configure these signals in the approved external monitoring platform.

| Signal | Suggested alert condition | Priority |
|---|---|---|
| API health | `/api/v1/health` unavailable for 2 consecutive probes | Critical |
| API readiness | `/api/v1/ready` reports database/Redis failure | Critical |
| API latency | sustained p95 increase above the environment baseline | High |
| PostgreSQL | connection failures, pool exhaustion, replication/disk issues | Critical |
| Redis | connection failures, sustained latency or memory/eviction pressure | High/Critical |
| Queue | backlog or oldest-item age grows continuously | High |
| Payout | sustained provider failures, retries or pending backlog | High |
| Webhook | signature failures, duplicate/replay spikes or processing backlog | High |
| Rewards | rejected/failed/reversed rate materially exceeds baseline | High |
| Fraud | high-risk actions/review backlog materially exceeds baseline | High |
| Withdrawals | failed/review/capacity-pending rate materially exceeds baseline | High |

## Dashboard minimum

Provide panels for API availability/latency, database health, Redis health, queue backlog, reward outcomes, fraud risk bands, withdrawal states, payout states and webhook outcomes.

Thresholds must be tuned from staging/production baselines. Do not put monitoring credentials, provider tokens or customer data in this repository.
