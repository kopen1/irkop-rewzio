# Rewzio Production Go-Live Checklist

This checklist separates repository work from external owner/provider/infrastructure work. **Never enable real-money payout while a required gate is unchecked.**

## Repository gates

- [x] Production CORS fails closed.
- [x] Mock payout is rejected in `NODE_ENV=production`.
- [x] Payout webhook verification fails closed without its secret.
- [x] User payout lookup is ownership scoped.
- [x] Payout processing/reconciliation require explicit admin authorization.
- [x] Admin session signing fails closed without production secret.
- [x] Docker build context excludes `.env*` and credential-bearing local files.
- [x] JWT signature verification uses constant-time comparison.
- [x] Request IDs use cryptographically unpredictable UUIDs.
- [x] CI and staging E2E workflows are green on the latest commit.

## External gates — required before launch

- [ ] Production `NODE_ENV=production` configured.
- [ ] Explicit non-wildcard `CORS_ORIGIN` configured.
- [ ] All production secrets stored outside Git.
- [ ] Real payout provider contract/account approved.
- [ ] Real payout provider integration configured and tested.
- [ ] Provider webhook endpoint configured and secret verified.
- [ ] Provider settlement/reconciliation implementation tested against real provider behavior.
- [ ] Production admin identity source and RBAC mapping verified.
- [ ] External metrics, dashboards, alerts and on-call ownership live.
- [ ] PostgreSQL automated backups enabled in off-host storage.
- [ ] Restore drill completed and evidence recorded.
- [ ] DR drill completed against target RTO/RPO.
- [ ] Cloudflare DNS/Tunnel/routing configured and tested.
- [ ] Android release signing configured; production feature scope verified.
- [ ] Privacy Policy approved and published.
- [ ] Terms of Service and reward/withdrawal rules approved and published.
- [ ] Applicable privacy/financial/compliance review completed by owner/legal team.
- [ ] Independent security review/penetration test completed.

## Release decision

**GO** only when every external gate above is checked by the responsible owner/provider/infrastructure operator.

**Current repository status:** Engineering foundation and security baseline are implemented, but external production gates remain deployment/business decisions and are intentionally not faked in source control.
