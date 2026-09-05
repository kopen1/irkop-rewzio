# Reward Flow

Reward processing is server-authoritative and must be idempotent for economically meaningful completion events.

1. User starts an eligible activity (daily check-in, mission, watch, referral, survey, offerwall, spin, quiz, game or ads as enabled).
2. Android sends the activity/completion request; it does not send an authoritative reward amount.
3. Backend validates eligibility, activity state, duplicate/replay constraints and configured reward rules.
4. Fraud engine evaluates relevant signals; suspicious rewards may be held.
5. Reward Engine calculates the configured Rewzio Coin amount server-side.
6. A PostgreSQL transaction records the reward and corresponding `coin_ledger` entry.
7. Wallet available balance reflects the ledger-controlled result.
8. A notification job may publish a reward-received notification.

Mini-features are server-authoritative, rate-limited, anti-replay, anti-duplicate and fraud-checked. Referral is one level and does not pay merely on registration: the referred user must complete a qualifying activity and pass eligibility.

The ledger must prevent double reward under retries/concurrency. Tests explicitly cover double reward, replay, fake amount, referral abuse, rapid watch and fake completion.
