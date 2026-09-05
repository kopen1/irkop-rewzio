# Rewzio

Rewzio is an Indonesia-first Android reward platform.

## Foundation

This repository is the initial engineering foundation. It deliberately contains minimal business logic and keeps the boundaries between Android, Admin, API, shared packages, infrastructure, and tests explicit.

### Stack

- Backend: Node.js, TypeScript, Fastify
- Data: PostgreSQL, Prisma
- Cache: Redis
- Admin: Next.js-ready TypeScript application
- Android: Kotlin + Jetpack Compose
- API contract: OpenAPI 3.x
- Infrastructure: Docker + Cloudflare-ready layout

### Product boundaries

- Backend is authoritative for reward amounts and balances.
- Android and Admin never connect directly to production databases.
- Webhooks must be verified and payout operations must be idempotent.
- Secrets are never hard-coded or committed.
- Rewzio v1 is Indonesia-only, IDR-only, with no crypto and no KYC system.

## Repository layout

```text
apps/android       Android application
apps/admin         Admin frontend
services/api       Fastify API service
packages/shared    Shared TypeScript primitives
packages/api-contract API contract and schemas
infrastructure     Docker, Cloudflare, monitoring, backup
scripts             Development/CI scripts
tests               Integration, E2E, security and load test areas
docs                Architecture, database, API, security and deployment docs
```

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

The API can be run with:

```bash
npm run dev:api
```

Environment variables are documented in `.env.example`. Never commit a real `.env` file.

## Initial API

- `GET /health`
- Versioned API namespace: `/api/v1`
- OpenAPI/Swagger target: `/api/docs`

## Source of truth

The repository foundation follows **REWZIO PRD v1.2 — Indonesia Only**. Implementation should proceed in small, validated increments, with security, ledger accuracy, fraud prevention, and payout reliability prioritized over feature expansion.
