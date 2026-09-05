# Architecture Decisions

## ADR-001 — PostgreSQL is the economic source of truth
**Status:** Accepted.

Balances, ledger entries, withdrawals, payouts, fraud state and audit records that affect business truth are durable PostgreSQL state. Redis is not authoritative.

## ADR-002 — Server-authoritative rewards and balances
**Status:** Accepted.

Android and Admin cannot write balances or choose reward amounts. This prevents client tampering and keeps reward rules centralized.

## ADR-003 — Ledger before wallet convenience
**Status:** Accepted.

The coin ledger records economic movements. Wallet exposes available/locked state derived and controlled from ledger/domain transactions; it is not a client-controlled number.

## ADR-004 — Provider abstraction
**Status:** Accepted.

Payout is isolated behind `PayoutProvider`. Mock is used for development, Duitku for initial production, and Xendit remains a future/secondary option. Provider credentials never leave the server.

## ADR-005 — Idempotency everywhere money can repeat
**Status:** Accepted.

Withdrawal, payout, webhook processing and important reward completion events require stable idempotency keys/identifiers so retries cannot duplicate economic effects.

## ADR-006 — Redis is disposable infrastructure
**Status:** Accepted.

Redis supports rate limits, short-lived state, locks, cache and queue coordination. Durable truth remains recoverable from PostgreSQL.

## ADR-007 — No KYC in Rewzio V1
**Status:** Accepted by product scope.

Rewzio V1 does not contain KYC profiles, verification or documents. Risk controls must not silently become a KYC implementation.

## ADR-008 — Indonesia-first currency boundary
**Status:** Accepted.

V1 uses Rewzio Coin and IDR only. No multi-country, FX, crypto payment, crypto wallet or global currency system is introduced.

## ADR-009 — Cloudflare at the edge
**Status:** Accepted.

Cloudflare/Cloudflared provides the external edge/tunnel boundary. Private application data stores remain inaccessible to clients.

## ADR-010 — Async jobs for retryable work
**Status:** Accepted.

Notifications, provider follow-up, withdrawal processing and reconciliation use jobs where appropriate. Jobs are idempotent and observable; failure must not silently mutate economic truth.
