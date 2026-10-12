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
