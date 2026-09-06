# Rewzio — Controlled Launch

**Prompt:** 26 — Controlled Launch  
**Current state:** PREPARED / NOT ACTIVATED  
**Production traffic:** MUST REMAIN CLOSED until every Go-Live Gate is PASS.

## Launch Guard

Prompt 26 prepares the controls; it does not override Prompt 25. The current Go-Live Gate remains BLOCKED / NO-GO, so no production rollout is authorized.

## Launch Controls

The existing database model provides `FeatureFlags` for app-scoped feature control and `AppSettings` for versioned application settings. These controls must be evaluated server-side for production decisions.

Required control keys:

- `maintenance_mode`
- `emergency_restriction`
- `withdrawal_enabled`
- `reward_enabled`
- `watch_enabled`
- `referral_enabled`
- `survey_enabled`
- `offerwall_enabled`
- `launch_stage`
- `limited_user_rollout`
- `fraud_threshold_low`
- `fraud_threshold_medium`
- `fraud_threshold_high`

### Safe Defaults

All money-moving and reward-producing controls default to **OFF / restricted** until explicitly enabled by an authorized production operator after the Go-Live Gate passes.

`maintenance_mode` and `emergency_restriction` are fail-safe controls. When active, affected operations must be rejected without mutating balances or creating reward/payout side effects.

## Kill Switches

| Control | Effect when OFF |
|---|---|
| Withdrawal | Reject new withdrawals; do not alter existing completed payouts. |
| Reward | Reject new reward issuance; preserve ledger integrity. |
| Watch | Prevent new watch reward flows. |
| Referral | Prevent new referral reward qualification/rewarding. |
| Survey | Prevent new survey reward flows. |
| Offerwall | Prevent new offerwall reward flows. |

Existing ledger entries remain immutable. Disabling a feature must never delete or rewrite historical financial records.

## Emergency Restriction

If a critical incident occurs:

1. Activate emergency restriction.
2. Disable suspicious reward and withdrawal flows.
3. Preserve logs, ledger records, webhook records, and audit evidence.
4. Investigate and identify scope.
5. Patch.
6. Run automated/security/staging tests.
7. Re-validate monitoring and reconciliation.
8. Resume only after an authorized release decision.

## Launch Sequence

### Stage 0 — Internal Test

- Internal/staging users only.
- Production traffic remains closed.
- Validate authentication, rewards, ledger, wallet, withdrawal controls, fraud controls, payout and webhook behavior.

### Stage 1 — Limited Users

- Small allowlisted cohort only.
- Enable only required features.
- Keep withdrawal and reward controls independently switchable.
- Monitor continuously.

### Stage 2 — Monitor

Minimum signals:

- crash rate
- API error rate
- reward abuse
- fraud score distribution
- withdrawal failure
- payout failure
- webhook failure
- database load
- Redis load
- support tickets

### Stage 3 — Increase Traffic

Increase exposure only after the previous stage meets the release thresholds approved by the production owner.

### Stage 4 — Wider Release

Do not enter wider release while any critical incident, unresolved payout discrepancy, webhook failure pattern, ledger inconsistency, or regulatory/approval blocker remains open.

## Fraud Threshold Adjustment

Fraud thresholds are operational controls, not a replacement for fraud review. Threshold changes must be:

- authorized;
- auditable;
- versioned;
- attributable to an operator;
- reversible.

Never use a single IP address as the sole reason to ban a user.

## Production Social Proof

Only genuinely completed withdrawals may be used.

- Never create fake transactions.
- Never fabricate payout counts.
- Mask user identity.
- Do not expose phone numbers, account numbers, provider references, or other sensitive identifiers.
- Failed, pending, rejected, or test payouts are not completed withdrawals.

## Rollback

Rollback must be possible without rewriting financial history:

1. Stop traffic increase.
2. Activate relevant kill switch.
3. Freeze suspicious rewards/withdrawals when required.
4. Preserve evidence.
5. Roll back application/configuration release.
6. Verify database and ledger consistency.
7. Re-run tests.
8. Resume only after explicit approval.

## Configuration Requirement

No production secrets or provider credentials belong in this document or source control. Production values must be supplied through the approved secret/configuration mechanism.

## Gate

**CONTROLLED LAUNCH STATUS: NOT ACTIVATED**  
**REASON: Prompt 25 Go-Live Gate remains BLOCKED / NO-GO.**
