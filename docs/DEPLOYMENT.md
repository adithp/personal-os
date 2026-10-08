# Deployment

## 0. Current server: AWS (Oracle is the planned long-term home)
Oracle Cloud had no free ARM capacity when I tried (Mumbai, October 2026), so the server runs on AWS first, paid for with the AWS free-plan credits (6 months). When the credits end, or Oracle capacity opens up, the same Docker setup moves to the other host. The server holds no data of its own (everything is in Supabase), so a move means redeploying the image.

Setup log (one line per step, newest last; no secrets here):
- 2026-10-07: Oracle instance form filled in (A1.Flex, Ubuntu 24.04) but creation failed for lack of capacity; switched to AWS.
- 2026-10-08: private GitHub repository created (adithp/personal-os); both branches pushed. CI workflow (.github/workflows/ci.yml) runs lint, tests, and build on every push and passed.
- 2026-10-08: AWS EC2 instance running and reachable over SSH; Elastic IP attached.
- 2026-10-08: DuckDNS name adith-os.duckdns.org created and points at the Elastic IP (checked with nslookup).
- 2026-10-08: Docker Engine 29.8.2 and Compose v5.6.0 installed on the server (Ubuntu, aarch64 confirmed).
- 2026-10-08: read-only GitHub deploy key created on the server; repo cloned to ~/personal-os (branch step-1-foundation).
- 2026-10-08: apps/server/.env copied from the PC with scp (never printed or pasted); infra/.env created on the server; both chmod 600.
- 2026-10-08: `docker compose up -d --build` in ~/personal-os/infra. Caddy and server are up, the server is healthy, and https://adith-os.duckdns.org/api/v1/health returns {"status":"ok"} with a valid certificate. Random internet scanners already hit / (404), which is normal.
- Step 2 note: the server now also needs DATABASE_URL (Supabase session pooler) in its .env. Add it to apps/server/.env on the PC, and to ~/personal-os/apps/server/.env on the AWS server before the next redeploy, or the server will refuse to start. Step 2 is built and tested against the local server (VITE_API_URL=http://127.0.0.1:3000/api/v1); the AWS server is left alone until you redeploy.
- Next: point the desktop app at the server (VITE_API_URL), lock SSH to my IP, set the budget alert, choose the backup target, add Tailscale, then the deploy workflow and the final deployment guide.

AWS rules for this server: security group allows TCP 80 and 443 from anywhere (UDP 443 for HTTP/3) and TCP 22 from my IP only; port 3000 is never opened. Budget alert of about $5 in AWS Billing. Check that the account is on the Free plan and note the end date of the credits in the calendar.

## 1. Oracle Cloud server
- Account: Oracle Cloud Free Tier (https://www.oracle.com/cloud/free/), home region Mumbai (Hyderabad only if Mumbai has no ARM capacity at signup).
- Upgrade the account to Pay As You Go and stay inside Always Free limits, so idle instances are not reclaimed. Budget alert at ₹1.
- Instance: VM.Standard.A1.Flex (ARM), 2 OCPU, 12 GB RAM, Ubuntu 24.04.
- Network: security list allows TCP 22 (my IP), 80, 443. Host firewall (iptables) allows the same.
- SSH: key only.

## 2. Software on the host
- Docker Engine + Docker Compose plugin (ARM64).
- Tailscale (laptop and server in the same tailnet).
- DuckDNS updater cron job (every 5 minutes).

## 3. Docker Compose (infra/docker-compose.yml)
| Service | Image | Exposed |
|---|---|---|
| caddy | caddy | ports 80, 443 (public) |
| server | built from apps/server/Dockerfile (multi-stage, linux/arm64) | internal port 3000 |
| omniroute | OmniRoute pinned version (ARM64), added in Step 3 | internal port 20128, plus Tailscale IP only |

- Step 1 compose file contains only caddy and server. OmniRoute is added in Step 3 with a pinned version chosen then.
- caddy: `caddy:2.11.7-alpine`, publishes 80 and 443 (and 443/udp for HTTP/3), keeps its certificates in the `caddy_data` volume, and starts only after the server is healthy.
- server: built from `apps/server/Dockerfile`. The server is bundled into one JavaScript file on the build machine and only the small runtime image (`node:22-alpine`, non-root user `node`) is made for linux/arm64. It listens on port 3000 inside the Docker network only (never published), checks itself with `GET /api/v1/health`, and runs with a read-only filesystem, no extra Linux capabilities, and a 512 MB memory limit.
- Needs two files on the server that are never committed: `infra/.env` (`DUCKDNS_DOMAIN`, see .env.example) and `apps/server/.env` (the server settings, including `SUPABASE_URL` and `DATABASE_URL`). Compose refuses to start if `DUCKDNS_DOMAIN` is missing.
- Start: `cd infra && docker compose up -d --build`. Check: open `https://<name>.duckdns.org/api/v1/health` in a browser; it should show `{"status":"ok", ...}`.

- OmniRoute data volume: omniroute-data, mounted at /app/data.
- OmniRoute settings: login required, API keys required for /v1.
- If the official OmniRoute image has no ARM64 build, build it from source with Node 22.

## 4. Caddyfile
- yourname.duckdns.org → reverse proxy to server:3000 with automatic HTTPS. No path rewriting: the server serves /api/v1/* itself.
- The name comes from `DUCKDNS_DOMAIN` in infra/.env (`{$DUCKDNS_DOMAIN}.duckdns.org`).
- Adds Strict-Transport-Security, X-Content-Type-Options and Referrer-Policy headers, removes the Server header, compresses responses, and checks the server's health. Caddy's access log hides the Authorization and Cookie headers.
- Ports 80 and 443 must be open in the Oracle security list and the host firewall (section 1).

## 5. Supabase
- Free plan project in the Mumbai region.
- DATABASE_URL uses the Supabase session pooler (IPv4, port 5432), because the direct connection is IPv6-only and the Oracle VM uses IPv4. Copy it from Supabase → Connect → Session pooler.
- JWTs are verified with the project JWKS; no JWT secret is needed on the server.
- Run Drizzle migrations from the laptop: pnpm db:migrate.
- Create my one account (the app has no sign-up screen):
  1. Supabase dashboard → Authentication → Users → Add user → Create new user.
  2. Enter my email and a strong password, tick "Auto Confirm User", and create it.
- Disable public sign-ups: Authentication → Sign In / Providers → turn off "Allow new users to sign up" → Save.
- Check: signing in from the app works with my account, and a sign-up request through the API is rejected.
- The backend's scheduled jobs keep the project active, so the free project does not pause.

## 6. Backups
- Settings in infra/.env: `BACKUP_DATABASE_URL` (the session pooler URL), `PG_MAJOR_VERSION`, `BACKUP_RETENTION_DAYS`, `OCI_BACKUP_BUCKET`, `OCI_REGION`, `OCI_S3_ENDPOINT`, `OCI_S3_ACCESS_KEY`, `OCI_S3_SECRET_KEY`. Create the S3 keys in the Oracle Console: your profile → Customer secret keys. The endpoint looks like `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`.
- Try it without changing anything: `DRY_RUN=1 infra/scripts/backup.sh` checks the settings and prints what it would do.
- The script verifies the dump can be read back before uploading, confirms the file is in the bucket afterwards, only deletes files named `personal-os-*.dump`, never prints secrets, and runs only one backup at a time.
- To restore: download a dump, then `pg_restore --no-owner --dbname "<database url>" personal-os-<time>.dump` using the same postgres major version.
- infra/scripts/backup.sh runs daily at 02:00 IST (host cron). It runs pg_dump from the official postgres Docker image whose major version matches the Supabase project (PG_MAJOR_VERSION, default 17), over the session pooler URL, compresses the file, uploads it with rclone to the Oracle Object Storage bucket personal-os-backups through the S3-compatible API, and deletes backups older than 30 days.
- infra/scripts/duckdns-update.sh updates the DuckDNS record every 5 minutes (host cron). It needs `DUCKDNS_DOMAIN` and `DUCKDNS_TOKEN` in infra/.env, sends the token to curl through standard input so it never shows in a process list, and prints `OK` or `KO` with a UTC time.
- Cron lines for both scripts are in infra/scripts/cron.example. The server clock is UTC, so 02:00 IST is `30 20 * * *`.

## 7. Coding tools access
- Claude Code and other coding tools point to http://<server-tailscale-ip>:20128/v1 with the coding key.

## 8. Desktop app
- Built locally with Tauri (pnpm build:desktop) and installed on my computer.
