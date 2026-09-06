# Prompt 20 test suite

Integration checks cover isolated PostgreSQL and Redis infrastructure. CI provisions temporary services and synchronizes the current Prisma schema only for the test database; production databases and credentials are never used.

Coverage includes database reachability, required financial tables, transaction atomicity, Redis atomic increment/expiry, and connectivity.

The repository test runner executes unit, integration, E2E, security, and load suites. Existing service tests remain authoritative for ledger, reward, referral, fraud, withdrawal, payout, and fee behavior.
