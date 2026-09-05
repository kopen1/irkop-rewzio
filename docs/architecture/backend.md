# Backend Architecture

## Stack

Node.js + TypeScript + Fastify + Prisma + PostgreSQL + Redis + JWT/OTP. Backend structure follows the locked domain split: `auth`, `users`, `devices`, `sessions`, `coins`, `ledger`, `wallet`, `rewards`, `withdrawal`, `payout`, `notifications`, `fraud`, plus feature modules and jobs.

## Request boundary

Routes authenticate and validate input, middleware applies authorization/rate limits, then domain services execute business rules. Persistence is isolated behind Prisma repositories/services. Controllers never mutate balances directly.

## Authentication

Supported login methods are phone number + OTP and Google Sign-In. Access tokens, refresh tokens, sessions, OTP requests and device registrations are server-managed. OTP and login attempts are rate-limited; sessions can be revoked.

## Economic path

Reward and withdrawal operations use PostgreSQL transactions. Coin ledger entries are the durable record. Wallet balances are never accepted from the client. Withdrawal locks funds before payout processing.

## Jobs

`jobs/` contains asynchronous handlers for notifications, withdrawal processing, payout polling/recovery, webhook follow-up and reconciliation. Every job carries a stable operation identifier and is safe to retry.

## Provider boundary

Payout providers implement a common interface. V1 development uses Mock; initial production uses Duitku; Xendit is a future/secondary provider. Credentials stay server-side and provider references are persisted.

## Migration

Prisma Migrate is the production schema mechanism. Production uses `prisma migrate deploy`; `prisma db push` is not used for production. Migration follows Expand → Migrate → Application Update → Contract.
