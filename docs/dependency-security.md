# Dependency Security

The CI dependency audit remains enforced at `high` severity.

Security remediation is pinned through root npm `overrides` for vulnerable transitive dependencies until their parent packages publish compatible dependency ranges:

- `@fastify/static` >= 10.1.2
- `deepmerge-ts` >= 8.0.0
- `postcss` >= 8.5.10

The lockfile is generated with these overrides and `npm ci` remains the installation command used by CI.
