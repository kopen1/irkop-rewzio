# Database

PostgreSQL is the system of record. Prisma is the schema/migration tool.

Production schema changes must use `prisma migrate deploy`, never `prisma db push`.

Migration pattern:

`Expand -> Migrate -> Application Update -> Contract`

Every migration must be committed, tested in staging, and have a rollback/recovery plan.

Ledger and balance consistency require transactional design and concurrency tests before production.
