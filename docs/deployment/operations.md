# Deployment Operations

Operational deployment uses the existing protected CI/CD environments. Staging and production remain safe placeholder hooks until a real target is explicitly selected.

## Reliability checklist

Before release:

- CI and DevOps quality checks are green.
- Docker image builds successfully.
- Database migrations are reviewed and backed up according to policy.
- Monitoring/alerting is available.
- Rollback target is known.

After release:

- Check API health/readiness.
- Check PostgreSQL and Redis connectivity.
- Check queue backlog.
- Watch reward, fraud, withdrawal, payout, and webhook error rates.
- Confirm no unusual financial-state changes.

## Production safety

Do not place PostgreSQL, Redis, Duitku, Xendit, Cloudflare Tunnel, or other production credentials in Git. Production secrets must be injected at runtime from the protected secret manager/GitHub Environment.

Production deployment remains a placeholder hook in CI until infrastructure ownership and deployment target are explicitly configured.
