# Deployment

## CI/CD
Pull requests and pushes to `master` run install, lint, typecheck, unit tests, integration tests, build, and security checks. Deployment credentials are not committed.

## Staging
Configure the GitHub Actions `staging` environment with protected secrets and deploy only after the CI gate passes. Use dedicated PostgreSQL/Redis resources.

## Production
Configure the GitHub Actions `production` environment with required GitHub Secrets and protected approvals. Build the container from `infrastructure/docker/Dockerfile`, deploy it to the approved runtime, and inject runtime credentials as environment variables. Never bake secrets into the image.

## Rollback
Keep the previous container image available. On a failed deployment, route traffic back to the last known-good image and investigate CI/deployment logs before retrying.
