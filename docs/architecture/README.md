# Architecture

Rewzio uses a layered boundary:

`Android / Admin -> Versioned API -> Domain services -> PostgreSQL / Redis -> External payout providers`

The API is authoritative for identity, rewards, ledger, wallet balance, withdrawal state and payout state.

Security priorities from the PRD: security, ledger accuracy, fraud prevention, payout reliability, UX, then feature expansion.
