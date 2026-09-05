# Rewzio Architecture Overview

**Status:** Locked baseline aligned to PRD v1.2 (Indonesia-only).

## 1. Core architecture

Rewzio is an Android-first reward platform. The authoritative backend is a Node.js/TypeScript service using Fastify, Prisma and PostgreSQL, with Redis for ephemeral state, rate limits and asynchronous job coordination. The Admin application uses the same API boundary and never connects directly to the database. Android also never connects directly to PostgreSQL or Redis.

```text
Android ──HTTPS──> Cloudflare ──> API/Fastify ──> PostgreSQL
                                      │             (source of truth)
                                      ├───────────> Redis
                                      ├───────────> Queue/Jobs
                                      ├───────────> Payout Provider
                                      └───────────> Notification Provider

Admin ───HTTPS────> Cloudflare ──> Admin/API boundary ──> Backend
Provider ─Webhook─> Cloudflare/API ────────────────────> Backend
```

The business flow is server-authoritative: activity validation → reward decision → coin ledger → wallet → withdrawal → risk → payout → webhook → reconciliation.

## 2. Domain boundaries

- **Identity:** users, devices, sessions, OTP, Google Sign-In.
- **Reward:** earning activities and reward configuration.
- **Ledger:** immutable economic history for Rewzio Coin.
- **Wallet:** derived/controlled available and locked balances.
- **Withdrawal:** user request, limits, fees, review and lifecycle.
- **Payout:** provider abstraction, idempotency and provider references.
- **Fraud/Risk:** signals, scores, holds and security actions.
- **Admin:** RBAC, configuration, review, operations and audit.
- **Support:** tickets, messages and dispute handling.
- **Notification:** push and in-app events.

## 3. Currency boundary

Rewzio V1 uses Rewzio Coin and IDR only. Initial conversion is 10 Rewzio Coin = Rp1; minimum withdrawal is Rp10.000. There is no global currency, FX, crypto payment, blockchain token or KYC subsystem in V1.

## 4. Reliability principles

PostgreSQL is authoritative. Redis may be lost and rebuilt. Economic writes use database transactions and idempotency. Provider callbacks are verified before state changes. Backups, restore procedures and DR drills are release gates.

## 5. Priority

Security > Ledger Accuracy > Fraud Prevention > Payout Reliability > UX > Feature Expansion.
