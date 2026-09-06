# Rewzio staging environment

Staging is an isolated environment and MUST NOT share production data, Redis, credentials, payout providers, webhook endpoints, or secrets.

## Domains

| Component | Staging hostname | Expected upstream |
|---|---|---|
| API | `api.servicebusiness.eu.org` | API :3001 |
| Admin | `admin.servicebusiness.eu.org` | Admin :3000 |
| Website | `rewzio.servicebusiness.eu.org` | Website :3002 |
| CDN | `cdn.servicebusiness.eu.org` | CDN :8080 |

Cloudflare DNS should point these hostnames to the staging Cloudflare Tunnel. The tunnel ingress example is in `infrastructure/cloudflared/staging-config.example.yml`.

## Isolation requirements

- `APP_ENV=staging` and `NODE_ENV=production` for the staging runtime.
- Use a staging-only PostgreSQL database and a staging-only Redis instance.
- Use staging-only `JWT_ACCESS_SECRET`, `OTP_SECRET`, OAuth credentials, and provider credentials.
- `PAYOUT_MODE=MOCK` is mandatory for staging. Do not configure Duitku/Xendit payout credentials in staging.
- Staging webhook URLs/signing material must be separate from production. Mock provider callbacks are used for staging validation.
- Never copy production `.env` files, database dumps, Redis data, or provider credentials into staging.

## Demo data boundary

Run `infrastructure/staging/seed-demo.mjs` only against the staging database. The seed creates an app with `Environment.STAGING` and demo settings including `is_demo=true` and `social_proof_is_demo=true`.

Demo rewards/content are explicitly named `STAGING DEMO` and carry `is_demo=true` metadata where the model supports metadata. Production reporting and social-proof queries must filter demo records out by environment/app boundary and `is_demo` metadata/flag.

## Start staging locally

1. Copy `infrastructure/staging/.env.example` to a local, untracked `.env` file.
2. Replace only the staging placeholders with staging-only values.
3. Start the isolated stack:

```bash
docker compose --env-file infrastructure/staging/.env -f infrastructure/staging/docker-compose.yml up -d --build
```

4. Prepare the staging schema and seed demo data:

```bash
docker compose --env-file infrastructure/staging/.env -f infrastructure/staging/docker-compose.yml exec api npx prisma db push --skip-generate
docker compose --env-file infrastructure/staging/.env -f infrastructure/staging/docker-compose.yml exec api node infrastructure/staging/seed-demo.mjs
```

5. Run the staging smoke test:

```bash
node infrastructure/staging/e2e-local.mjs
```

6. Stop the environment when finished:

```bash
docker compose --env-file infrastructure/staging/.env -f infrastructure/staging/docker-compose.yml down
```

## Cloudflare / Cloudflared

The repository contains configuration examples only. The real tunnel ID and credentials stay outside Git. Configure the four hostnames as separate ingress rules and route them only to staging services. Do not reuse a production tunnel credential.

## Public staging E2E

After the DNS records and tunnel are configured, run:

```bash
STAGING_API_URL=https://api.servicebusiness.eu.org \
STAGING_ADMIN_URL=https://admin.servicebusiness.eu.org \
STAGING_WEBSITE_URL=https://rewzio.servicebusiness.eu.org \
STAGING_CDN_URL=https://cdn.servicebusiness.eu.org \
node infrastructure/staging/e2e-public.mjs
```

The public test is a smoke test only; it does not mutate production and does not require production credentials.

## Operational rule

A staging transaction is never a production transaction. Keep separate database names, Redis instances, credentials, payout mode, webhook configuration, and environment flags at every layer.
