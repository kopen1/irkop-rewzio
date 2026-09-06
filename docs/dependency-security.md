# Dependency Security

The CI dependency audit remains enforced at `high` severity.

Current remediations use direct dependency ranges so the committed lockfile remains reproducible with `npm ci`:

- `@fastify/swagger-ui` 6.1.1
- Prisma CLI/client 6.12.0
- Next.js 16.3.4
- `postcss` 8.5.27

No audit threshold is lowered and no security check is disabled.
