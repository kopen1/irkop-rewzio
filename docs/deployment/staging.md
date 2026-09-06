# Rewzio Staging Environment

## Domains

| Component | Staging hostname | Intended origin |
|---|---|---|
| API | `api.servicebusiness.eu.org` | staging API runtime |
| Admin | `admin.servicebusiness.eu.org` | staging admin runtime |
| Website | `rewzio.servicebusiness.eu.org` | staging website runtime |
| CDN | `cdn.servicebusiness.eu.org` | staging CDN/runtime |

These hostnames are staging-only. Production must use separate hostnames, data stores, credentials, and provider configuration.

## Required separation

Staging MUST use:

- a dedicated PostgreSQL database named/owned for staging;
- a dedicated Redis instance or isolated Redis deployment;
- staging-only JWT/OTP/application credentials;
- `PAYOUT_MODE=MOCK`;
- staging-only webhook endpoints/secrets;
- `NODE_ENV=staging` and `APP_ENV=staging`;
- `IS_DEMO=true` and `SOCIAL_PROOF_IS_DEMO=true` for demo/social-proof surfaces.

Never point the staging stack at production PostgreSQL, Redis, payout providers, webhook credentials, or production secrets.

## Local staging stack

1. Copy `infrastructure/staging/.env.example` to a local, untracked staging env file.
2. Replace only the staging placeholders.
3. Start `infrastructure/staging/docker-compose.yml`.
4. Apply the Prisma schema using the staging `DATABASE_URL`.
5. Run `node infrastructure/staging/seed-demo.mjs`.
6. Verify that the seeded `Apps.environment` is `STAGING` and the app settings contain `is_demo=true` and `payout_mode=MOCK`.

The staging stack uses named PostgreSQL and Redis volumes (`rewzio_staging_postgres`, `rewzio_staging_redis`) so local staging data is not mixed with the generic development compose stack.

## Demo data safety

The seed uses an app with `Environment.STAGING`, an explicit `is_demo=true` setting, and demo metadata on seeded rewards. Social-proof code must consume the staging/demo flag rather than presenting demo activity as real production activity.

There is no shared production database in this setup, so staging demo transactions cannot appear in production transactions unless an operator deliberately points staging credentials at production, which is prohibited.

## Cloudflare / Cloudflared

Use the example ingress in `infrastructure/cloudflared/staging-config.example.yml`. The real tunnel ID and credentials file are external secrets and MUST NOT be committed.

The expected ingress mapping is:

- `api.servicebusiness.eu.org` → staging API on port `3001`
- `admin.servicebusiness.eu.org` → staging Admin on port `3000`
- `rewzio.servicebusiness.eu.org` → staging Website on port `3002`
- `cdn.servicebusiness.eu.org` → staging CDN on port `8080`

Cloudflare DNS records should target the staging Cloudflare Tunnel, not a production tunnel. Keep production tunnel credentials and DNS configuration separate.

## Staging E2E smoke test

Run:

```bash
node tests/e2e/staging-smoke.mjs
```

Optional environment overrides:

```bash
STAGING_API_URL=https://api.servicebusiness.eu.org \
STAGING_ADMIN_URL=https://admin.servicebusiness.eu.org \
STAGING_WEBSITE_URL=https://rewzio.servicebusiness.eu.org \
STAGING_CDN_URL=https://cdn.servicebusiness.eu.org \
node tests/e2e/staging-smoke.mjs
```

The smoke test verifies API health/API v1 plus HTTP reachability of Admin, Website, and CDN. It must be executed only after the staging endpoints are actually deployed and routed through Cloudflare.

At repository setup time these hostnames are documented targets; this commit does not connect or provision real Cloudflare infrastructure or production services.
