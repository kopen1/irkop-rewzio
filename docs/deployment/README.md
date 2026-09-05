# Deployment

Production infrastructure is designed around PostgreSQL, Redis, Cloudflare/Cloudflared and the API service.

Before production:

1. Validate legal/regulatory classification.
2. Validate backup and restore.
3. Validate monitoring and incident response.
4. Validate payout provider approval and webhook verification.
5. Run security, integration, E2E, load and disaster-recovery tests.
6. Deploy database migrations with Prisma Migrate.

Initial DR design targets from the PRD are RPO <= 15–60 minutes and RTO <= 1–4 hours; these are design targets and must be validated against real infrastructure.
