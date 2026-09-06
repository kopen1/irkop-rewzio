# Rewzio environments

## Development
Run locally with Docker Compose and a dedicated development database/Redis. Use a local `.env` file that is never committed.

## Staging
Use a dedicated PostgreSQL database, Redis instance, domains, and credentials. Configure values through GitHub Actions environment secrets/variables; never store credentials in Git.

## Production
Production credentials must be supplied through GitHub Secrets or environment-level protected secrets. Required secrets include database URL, Redis URL, JWT access secret, OTP secret, and provider credentials as enabled. Do not place real credentials in workflow YAML, Docker images, source code, or documentation.

Environment separation is mandatory: never point development/staging workloads at production data stores.
