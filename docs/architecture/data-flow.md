# Data Flow

## Primary earning flow

```text
User action
  -> Android
  -> API authentication + validation
  -> activity/module validation
  -> Reward Engine
  -> Fraud/Risk signals
  -> Coin Ledger transaction
  -> Wallet available balance
  -> response to Android
  -> optional notification job
```

The client supplies intent/evidence, never the authoritative reward value.

## Withdrawal flow

```text
Android -> API -> create withdrawal
                 -> lock wallet balance
                 -> limits/capacity
                 -> Fraud/Risk
                 -> AUTO / REVIEW / QUEUE
                 -> Payout provider
                 -> provider webhook
                 -> verification + idempotency
                 -> reconciliation
                 -> final status
                 -> ledger/wallet transition + notification
```

## Admin flow

```text
Admin -> Cloudflare -> Admin/API -> RBAC/2FA -> domain service -> PostgreSQL
                                              -> audit log
```

## Provider webhook flow

Provider → edge/API → authenticate/verify callback → deduplicate → persist event → transition payout/withdrawal → reconciliation → notification.

## Data stores

PostgreSQL stores durable users, sessions, rewards, ledger, wallets, withdrawals, payouts, webhooks, fraud/risk, notifications, support and audit data. Redis stores short-lived operational state such as rate limits, locks, cache and queue coordination. No client or admin interface bypasses the API.
