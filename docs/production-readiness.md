# Rewzio Production Readiness Audit

Date: 2026-09-07
Branch: `master`

## Result

The repository is **not yet production-ready for a real-money launch**. Critical technical findings that can be fixed safely have been corrected and re-verified in this audit. Remaining blockers are business/legal or require production infrastructure/provider decisions.

## Technical audit

| Area | Result | Notes |
|---|---|---|
| Architecture | PASS with blocker | Monorepo separation and API modules are present. Operational infrastructure is documented. |
| Database | PASS | PostgreSQL/Prisma are used; financial operations use transactional locking/Serializable where required. Schema contains indexes for the principal user, ledger, reward, withdrawal, payout, webhook and fraud access paths. |
| API | PASS with blocker | Authenticated routes and standardized errors exist. Production CORS is mandatory and explicit. |
| Android | BLOCKER | Current Android implementation is build-complete but remains a minimal implementation; production feature completeness and release signing/Play deployment still require completion/verification. |
| Admin | PASS with blocker | RBAC exists in the admin UI. Production admin session signing fails closed when `ADMIN_SESSION_SECRET` is missing. Backend role mapping remains a production integration item. |
| Authentication | PASS | JWT/session validation checks session ownership, app, status and expiry. Secrets are environment supplied; JWT signature comparison uses constant-time verification. OTP and authentication endpoints have Redis-backed rate limits. |
| Authorization / RBAC | FIXED + BLOCKER | Payout processing/reconciliation endpoints require an explicit externally supplied `ADMIN_API_SECRET`. User payout lookup is ownership-scoped. Production admin identity/RBAC integration remains a blocker. |
| Coin Ledger | PASS | Immutable ledger design, idempotency and transactional balance updates are present. |
| Reward Engine | PASS | Server-authoritative reward definitions and centralized fraud/eligibility flow are present. |
| Fraud | PASS with operational blocker | Risk scoring and security actions exist; production thresholds and alert ownership must be configured. |
| Wallet / Withdrawal | PASS | Ownership checks, idempotency, capacity controls and serialized financial updates are present. |
| Payout | FIXED + BLOCKER | `MOCK` payout provider cannot run under `NODE_ENV=production`; provider webhook verification has no hardcoded fallback secret. Real provider integration remains a deployment/business blocker. |
| Webhook | PASS with blocker | Signature verification, replay/idempotency and redacted persistence exist. Real provider callback configuration must be completed before launch. |
| Reconciliation | BLOCKER | Current reconciliation implementation is a placeholder provider-status lookup and cannot be treated as a production settlement control until real provider reconciliation is implemented. |
| Notifications | PASS with integration blocker | Provider abstraction exists; real push/email provider configuration is still external. |
| Support | PASS with blocker | User ownership and active-admin checks exist; malware scanner/storage are abstractions and require production services/configuration. |
| Monitoring | BLOCKER | Health/readiness and structured logging exist, but an external production metrics/alerting stack is not configured in this repository. |
| Backup / DR | BLOCKER | Procedures and targets are documented, but actual backup storage, restore verification and DR execution must be configured and drilled in production infrastructure. |
| CI/CD | PASS with blocker | CI/DevOps workflows exist. Production deployment remains a safe placeholder by design. |
| Cloudflare | BLOCKER | No production Cloudflare/Tunnel connection is configured in-repository; production routing must be configured externally. |
| Secrets | PASS baseline | Production secrets are environment/secret-store inputs. Docker build excludes `.env*` from build context. |
| Logging | PASS | Request IDs and structured logs are used; provider payloads are redacted before persistence. Authentication audit logs mask phone numbers and do not log OTP/JWT/refresh-token values. |
| Rate limiting | PASS with operational blocker | Rate controls exist across sensitive authentication/reward/provider flows; production thresholds need monitoring/tuning. |
| Idempotency | PASS | Financial and reward paths use idempotency keys and unique constraints. |
| Concurrency | PASS with ongoing verification | Serializable transactions and row/advisory locks are used on critical financial paths. Production load testing remains required. |
| Data deletion | PASS with operational blocker | Deletion/anonymization jobs are modeled and scheduled; a production worker/execution mechanism must be operational. |
| Privacy | BLOCKER | A production privacy policy, retention disclosure, user-data rights process and approved data-processing disclosures must be supplied by the owner/legal team. |
| Terms | BLOCKER | Production Terms of Service, reward/withdrawal rules, provider terms and user-facing legal acceptance flow require business/legal approval. |
| Security | PASS baseline with blockers | Core controls are present and the critical production-default issues found in this audit were fixed. Independent penetration testing and production configuration review remain required. |

## Critical fixes applied / re-verified

### 1. Production CORS fail-closed

`CORS_ORIGIN=*` is allowed only for development/test; production requires an explicit non-wildcard `CORS_ORIGIN`.

### 2. Mock payout cannot run in production

The payout provider factory rejects `MOCK` when `NODE_ENV=production`.

### 3. No hardcoded payout webhook secret fallback

Payout webhook verification fails closed when the provider secret is missing.

### 4. Payout authorization

User payout status lookup is restricted to the authenticated user's own withdrawal. Payout processing and reconciliation require the externally supplied `ADMIN_API_SECRET`.

### 5. Admin session secret fail-closed

The admin session signer no longer silently uses the development signing secret in production.

### 6. Docker build-context secret protection

A root `.dockerignore` excludes `.env*`, credentials-bearing local files and build artifacts from Docker build context.

### 7. Constant-time JWT verification

Access-token signatures are now compared with `timingSafeEqual` after equal-length checks instead of ordinary string comparison.

### 8. Unpredictable request IDs

Fastify request IDs now use `crypto.randomUUID()` rather than `Math.random()`-derived identifiers.

## Audit findings that are intentionally blockers

These cannot be safely auto-fixed without an external business, legal, provider or infrastructure decision:

1. Approved Privacy Policy and data-retention disclosures.
2. Approved Terms of Service and reward/withdrawal rules.
3. Production identity/verification and financial compliance requirements, if applicable to the operating model and jurisdictions.
4. Final payout-provider contract and settlement/reconciliation behavior.
5. Production monitoring/alert ownership and on-call escalation.
6. Backup retention, off-site storage and restore authority.
7. Final Android production feature scope, release signing and store-release approval.
8. Production Cloudflare/Tunnel routing and DNS configuration.
9. Production admin identity/RBAC integration.

## Production go/no-go gates

Do not enable real-money production payout until all of the following are verified:

- `NODE_ENV=production` with explicit CORS and all required secrets.
- `PAYOUT_MODE` selects a real, fully implemented provider.
- Provider webhook secrets are configured outside Git.
- Real payout reconciliation is implemented and tested.
- Admin access is integrated with the production RBAC identity source.
- External monitoring and alerting are live.
- PostgreSQL backups are automated and a restore drill succeeds.
- DR procedure is drilled within the target RTO; backup cadence meets the target RPO.
- Privacy Policy and Terms are approved and published.
- Android production build/signing and required user-facing functionality are verified.
- Independent security review/penetration test is completed before handling real user funds.

RPO/RTO targets are design targets, not SLA guarantees.
