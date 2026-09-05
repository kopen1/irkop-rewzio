# Fraud Flow

Fraud is a risk-control layer, not a single-rule ban system.

```text
Activity / withdrawal
 -> collect risk signals
 -> correlate account/device/IP/relationships/behavior
 -> calculate fraud/risk score
 -> policy decision
 -> allow / hold / review / security action
 -> audit + monitoring
```

Signals include account age, device relationships, IP events, user relationships, velocity, reward patterns, withdrawal patterns, referral behavior and prior fraud score. Relevant data is represented by `fraud_scores`, `fraud_events`, `risk_signals`, `ip_events`, `device_relationships`, `user_relationships`, `reward_holds`, `security_actions`, and blocked entity records.

The system explicitly tests multi-device, multi-account, referral abuse, rapid watch, fake completion, double reward, double withdrawal, replay and duplicate webhook scenarios.

An IP address alone is never a ban rule. Suspicious activity may hold rewards or withdrawals while preserving evidence for review. Admin fraud actions require explicit permission and audit logging.

Emergency kill switch: freeze suspicious rewards/withdrawals → preserve logs → investigate → patch → test → resume.
