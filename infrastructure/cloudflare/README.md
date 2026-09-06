# Cloudflare staging routing

This directory contains documentation/examples only. Never commit a real Cloudflare API token, tunnel token, tunnel credentials JSON, or account-specific secret.

## Hostnames

- `api.servicebusiness.eu.org` → staging API (`http://127.0.0.1:3001` on the tunnel host)
- `admin.servicebusiness.eu.org` → staging Admin (`http://127.0.0.1:3000`)
- `rewzio.servicebusiness.eu.org` → staging Website (`http://127.0.0.1:3002`)
- `cdn.servicebusiness.eu.org` → staging CDN (`http://127.0.0.1:8080`)

Use `infrastructure/cloudflared/staging-config.example.yml` as the ingress template. Replace `<STAGING_TUNNEL_ID>` only in the untracked runtime configuration on the staging host.

## Cloudflare DNS

Create the four DNS hostnames in the intended Rewzio zone and route them to the staging tunnel. Keep production DNS/tunnel configuration separate. Enable HTTPS at the Cloudflare edge and do not expose PostgreSQL or Redis through the tunnel.

## Cloudflared runtime

1. Install `cloudflared` on the staging host.
2. Create the tunnel using the Cloudflare account intended for staging.
3. Store the generated credentials JSON outside Git, for example under `/etc/cloudflared/` with restrictive filesystem permissions.
4. Install the example config as the staging runtime config and substitute the real tunnel ID.
5. Validate the tunnel before enabling the service.
6. Run `node infrastructure/staging/e2e-public.mjs` after DNS propagation.

The repository intentionally does not automate creation of DNS records or tunnels because that would require real Cloudflare account credentials and could affect production infrastructure.
