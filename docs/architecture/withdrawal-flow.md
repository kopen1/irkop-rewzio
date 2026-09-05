# Withdrawal Flow

## Rules

- Initial conversion: 10 Rewzio Coin = Rp1.
- Minimum withdrawal: Rp10.000.
- Methods: DANA, OVO, GoPay, ShopeePay and Bank.
- No KYC subsystem in V1.

## Lifecycle

```text
Coin balance
 -> withdrawal request
 -> validate amount/method
 -> lock balance
 -> user/app daily limits
 -> daily capacity
 -> fraud/risk
 -> AUTO / REVIEW / QUEUE
 -> provider
 -> webhook
 -> reconciliation
 -> final status
```

Supported statuses: `PENDING_REVIEW`, `APPROVED`, `PROCESSING`, `PENDING_PROVIDER`, `COMPLETED`, `FAILED`, `REJECTED`, `CANCELLED`, `REFUNDED`, `PENDING_CAPACITY`.

If daily capacity is full, the request can enter `PENDING_CAPACITY`; capacity exhaustion is not automatically a failure.

Risk inputs can include account age, first withdrawal, amount, velocity, referral risk, device cluster and fraud score. LOW can auto-process, MEDIUM can require pending/review, and HIGH can be held/reviewed. Thresholds are configurable and are not legal rules.

Every withdrawal has an internal transaction ID, withdrawal ID, provider reference and idempotency key. Repeating the same request must not create a second payout.

On success, the provider result is reconciled before the withdrawal is finalized. Failed/rejected/refunded paths restore or release the locked balance according to the domain transaction rules.
