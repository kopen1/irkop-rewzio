# System Design

## Component model

| Component | Responsibility | Authority |
|---|---|---|
| Android | UX, authenticated API client, activity presentation | none for money/rewards |
| Admin | Operations, configuration, review, support | bounded by RBAC |
| Fastify API | Domain orchestration and API boundary | business decisions |
| PostgreSQL | Users, ledger, wallet, withdrawals, fraud, audit | source of truth |
| Redis | rate limits, short-lived state, locks/coordination, queues | non-authoritative |
| Jobs/Workers | asynchronous reward, notification, withdrawal and reconciliation work | writes through domain services |
| Cloudflare | DNS/CDN/edge protection/tunnel routing | network boundary |
| Payout provider | external payment execution | external system |

## Deployment topology

Public traffic terminates at Cloudflare and is routed to the appropriate application/API origin. The production database and Redis are private infrastructure. Provider webhook endpoints enter the backend through the same controlled edge and are authenticated independently.

## Data ownership

PostgreSQL owns durable state. Redis data must have a TTL or a deterministic rebuild path unless explicitly documented otherwise. No client-provided balance or reward amount is trusted.

## Async processing

Queues are used where work is retryable or slow: notification delivery, reward/provider callbacks, withdrawal processing, reconciliation and scheduled maintenance. Jobs are idempotent and use bounded retries with dead-letter/manual-review handling where required.

## Failure model

A provider outage must not turn a valid withdrawal into a false failure. Capacity exhaustion can produce `PENDING_CAPACITY`. Webhook duplication is harmless through idempotency. Redis outage degrades rate-limit/cache/job capabilities but must not corrupt the ledger. Database failure blocks economic writes rather than accepting unverifiable state.

## Environment boundaries

LOCAL, STAGING and PRODUCTION are isolated. Demo data is permitted only outside production. Mock payout is the development default; initial production payout is Duitku, with provider abstraction allowing a future Xendit integration.
