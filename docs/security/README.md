# Security

Non-negotiable guardrails:

- No hard-coded secrets.
- Never send server secrets to Android.
- No client-side authority over reward amounts or balances.
- No direct database access from Android or Admin.
- Verify every provider webhook.
- Payout operations must be idempotent.
- Admin uses RBAC, 2FA, session management, rate limiting, audit logs and permission checks.
- Staff does not automatically receive payout permission.
- Collect only necessary data and maintain retention/deletion controls.
