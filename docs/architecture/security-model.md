# Security Model

## Security boundaries

1. **Edge boundary:** Cloudflare protects and routes public HTTP(S) traffic.
2. **Application boundary:** Fastify authenticates, authorizes and validates requests.
3. **Data boundary:** PostgreSQL is private and accessed only by backend services.
4. **Cache/job boundary:** Redis is private and non-authoritative for economic truth.
5. **Provider boundary:** payout credentials and webhook verification remain server-side.
6. **Admin boundary:** separate RBAC + 2FA + session controls protect privileged actions.
7. **Client boundary:** Android is untrusted and cannot set balances/rewards.

## Authentication and authorization

Phone OTP and Google Sign-In establish identity. Access/refresh tokens and sessions are server-controlled. OTP, login and sensitive endpoints are rate-limited. Admin operations require RBAC and 2FA.

## Economic integrity

No client-side balance, reward amount, direct database access, unverified webhook or non-idempotent payout. Ledger writes and balance transitions are transactional. Withdrawal locks balance before provider execution.

## Fraud

Signals may include account age, first withdrawal, amount, velocity, referral risk, device cluster, IP/activity relationships and historical fraud score. One IP is never sufficient for a ban decision. Suspicious activity can create reward holds, withdrawal review or security actions.

## Secrets and data

Secrets are environment-managed, never hard-coded or shipped to APK, and production `.env` files are not committed. Collect only necessary data, encrypt sensitive data, enforce access control, apply retention/deletion policies and secure logs.

## Incident controls

Monitoring covers API, DB, Redis, reward processing, withdrawal queue, payout, webhooks, fraud and authentication. A kill switch can freeze suspicious rewards/withdrawals, preserve logs, investigate, patch, test and resume.
