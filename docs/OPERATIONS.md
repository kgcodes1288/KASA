# GetCleanStays: running it (backups, monitoring, deploys)

Everything runs on the home server "Lasso". Prod = `/opt/stacks/webapp`, staging = `/opt/stacks/webapp-staging`.

## Backups (already running)
- **What:** the Lasso offsite backup (`lasso-backup@backup.timer`, nightly ~03:00 UTC) dumps the prod database
  (`webapp-postgres-1` → `/var/backups/lasso-db/webapp.sql`) and snapshots `/opt/stacks` (compose files, `.env`), `/etc`, `/home`
  to Backblaze B2 with restic. Retention: 7 daily, 4 weekly, 12 monthly. A watchdog alerts your phone if no backup succeeds in 48 h.
- **Restore drill done 2026-10-12:** a fresh dump was restored into a scratch database and row counts matched.
- **Restore the prod database from the cloud copy**
  1. `sudo bash -c 'set -a; . /etc/restic/env; set +a; restic snapshots --latest 5'` (pick a snapshot)
  2. `sudo bash -c 'set -a; . /etc/restic/env; set +a; restic restore <snapshot-id> --target /tmp/restore --include /var/backups/lasso-db/webapp.sql'`
  3. Test it first in a scratch DB: `docker exec webapp-staging-postgres-1 psql -U cleanstay -d postgres -c "CREATE DATABASE drill"` then
     `docker exec -i webapp-staging-postgres-1 psql -U cleanstay -d drill < /tmp/restore/var/backups/lasso-db/webapp.sql`
  4. Real restore (this REPLACES prod data): `docker compose -f /opt/stacks/webapp/docker-compose.yml stop api mcp`, then
     `docker exec -i webapp-postgres-1 psql -U cleanstay -d cleanstay < /tmp/restore/var/backups/lasso-db/webapp.sql`, then `start api mcp`.
- **Before a risky change**, take your own copy: `docker exec webapp-postgres-1 pg_dump -U cleanstay cleanstay > ~/prod-$(date +%F).sql`.
- Uploaded task photos live in Cloudinary (not on Lasso).

## Monitoring (installed 2026-10-12)
- `getcleanstays-watch.timer` runs `/usr/local/bin/getcleanstays-watch.sh` every minute (source: `ops/` in this repo; topic in `/etc/getcleanstays-watch.conf`).
- It checks the website, `/api/health?deep=1` (proves the database answers), the AI connector, the 5 prod containers (and restarts),
  TLS expiry (<14 days), disk (85%/92%), and the API log for real errors (unhandled errors, failed emails/texts, database errors).
- Phone alerts go to the same private ntfy topic as the backup and temperature alerts: DOWN after 2 failed minutes, RECOVERED when fixed.
- Test it: `sudo /usr/local/bin/getcleanstays-watch.sh selftest`. Logs: `journalctl -u getcleanstays-watch`.

## Deploying
`git push origin staging:main staging:dev staging:staging` then `/opt/stacks/deploy.sh prod` (rebuilds api, client, mcp from branch `dev`).
Test on staging first (`https://staging.getcleanstays.com`, basic-auth). The API runs `prisma db push` on start and then
small idempotent migration scripts (`server/scripts/migrate-*.js`).

## Regression test suite
`~/qa/*.py` on Lasso: scripted checks for sign-in, listings, jobs/texts, tasks/quotes, notifications, security, screens and the AI connector.
They need QA accounts (password `QaTest#2026`) and were run against prod on 2026-10-11, then all QA data was deleted.

## Logs

| What | Where | Kept |
|---|---|---|
| Every web request (time, real client IP, method, path, status, browser; includes crawlers and scanners) | `/opt/stacks/webapp/caddy-logs/access.log` (root-only: `sudo tail -f`) | 14 days, rolls at 50 MB |
| Security events (failed sign-ins, lockouts, CSRF blocks, bad Google state, assistant approvals) | Postgres table `SecurityEvent` | 90 days, pruned daily |
| Assistant tool calls | Postgres `McpAuditLog` | kept |
| App/container output | `docker logs <container>` | 10 MB x 5 files per container |

Tokens in links (`?token=`, `?code=`, `/job/<token>` ...) and Cookie/Authorization headers are redacted before they reach the access log.
Handy: `sudo grep -o '"remote_ip":"[^"]*"' access.log | sort | uniq -c | sort -rn | head` (top talkers);
`select type, ip, count(*) from "SecurityEvent" where "createdAt" > now() - interval '1 day' group by 1,2 order by 3 desc;`
The monitor pushes an alert for 40+ failed sign-ins in 10 minutes, or 25+ blocked/failed requests from one address.

## Network path (since 2026-10-24)

All public traffic reaches the app through a Cloudflare Tunnel, so the home IP is not exposed and no router ports are needed.
`getcleanstays.com`, `www`, `api`, `mcp`, `staging`, `api-staging`, `mcp-staging` and `raincheck-api` are proxied CNAMEs to the tunnel
(`lasso-family`, docker container `cloudflared-family`, managed in Cloudflare; ingress -> `http://localhost:80`, i.e. the webapp Caddy).
DNS for the domain lives in Cloudflare (zone `getcleanstays.com`); `send` MX (Resend) is DNS-only.
- Caddy trusts the local tunnel hop (`trusted_proxies private_ranges`) and reads the visitor IP from `Cf-Connecting-Ip`, then sets `X-Forwarded-For` to that single IP, so the API's `trust proxy 1`, rate limits and SecurityEvent IPs stay correct. In the access log use `request.client_ip` (not `remote_ip`).
- Caddy serves plain http for the tunnel and redirects `X-Forwarded-Proto: http` visitors to https. The https listeners remain only until the router ports are closed.
- If the tunnel is down the site is down: the monitor watches `cloudflared-family`. Restart: `docker restart cloudflared-family`.
- Rollback to direct access: in Cloudflare, delete the 8 CNAMEs and re-add `A` records -> the home IP (DNS only), forward router 80/443 to Lasso. Config backups: `/opt/stacks/webapp/Caddyfile.pre-cf-tunnel`, `~/.config/cloudflare/tunnel_config.backup-pre-getcleanstays.json`.
- Cloudflare auto-injects a Web Analytics beacon into proxied pages; our CSP blocks it (console noise only). Switch it off in the dashboard (Analytics & Logs > Web Analytics) if unwanted.
