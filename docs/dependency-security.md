# Dependency Security

The CI dependency audit remains enforced at `high` severity.

Current remediations use direct dependency ranges so the committed lockfile remains reproducible with `npm ci`:

- `@fastify/swagger-ui` >= 6.1.1
- Prisma CLI/client pinned to the audited-safe 6.12.x line
- `postcss` >= 8.5.27

No audit threshold is lowered and no security check is disabled.
