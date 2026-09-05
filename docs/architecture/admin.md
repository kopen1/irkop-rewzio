# Admin Architecture

Admin is an operational application, not a database client. It calls backend APIs over the authenticated admin boundary.

## Roles

`ADMIN` has full management capability. `STAFF` receives only explicit RBAC permissions and does not automatically receive payout authority.

Required controls: RBAC, 2FA, session management, rate limiting, permission checks and immutable audit logging for important actions.

Key permissions include `users.view/edit/suspend`, `withdrawals.view/approve/reject`, `rewards.view/edit`, `fraud.view/action`, `settings.view/edit` and `payout.view/action`.

## Operations

The panel covers Dashboard, Applications, Users, Rewards, Content, Survey, Offerwall, Referral, Wallet, Withdrawals, Payout, Fraud & Security, Sponsors, Affiliate, Notifications, Reports, Analytics, Settings, Staff, Audit Logs, Developer Tools and Support.

## Configuration boundary

Business settings may control coin rate, reward amounts, limits, fees, feature flags, maintenance, fraud thresholds and payout routing. Infrastructure secrets are never stored as ordinary business settings.

## High-risk operations

Payout actions, fraud/security actions, reward configuration and account-impacting operations require explicit permissions and audit records. Emergency kill switches can freeze suspicious rewards/withdrawals while preserving evidence.
