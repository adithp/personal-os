# Deployment

## 0. Current server: AWS (Oracle is the planned long-term home)
Oracle Cloud had no free ARM capacity when I tried (Mumbai, October 2026), so the server runs on AWS first, paid for with the AWS free-plan credits (6 months). When the credits end, or Oracle capacity opens up, the same Docker setup moves to the other host. The server holds no data of its own (everything is in Supabase), so a move means redeploying the image.

Setup log (one line per step, newest last; no secrets here):
- 2026-10-07: Oracle instance form filled in (A1.Flex, Ubuntu 24.04) but creation failed for lack of capacity; switched to AWS.
- 2026-10-08: private GitHub repository created (adithp/personal-os); both branches pushed. CI workflow (.github/workflows/ci.yml) runs lint, tests, build (which includes typecheck), and the docs check on every push and passed.
- 2026-10-08: AWS EC2 instance running and reachable over SSH; Elastic IP attached.
- 2026-10-08: DuckDNS name adith-os.duckdns.org created and points at the Elastic IP (checked with nslookup).
- 2026-10-08: Docker Engine 29.8.2 and Compose v5.6.0 installed on the server (Ubuntu, aarch64 confirmed).
- 2026-10-08: read-only GitHub deploy key created on the server; repo cloned to ~/personal-os (branch step-1-foundation).
- 2026-10-08: apps/server/.env copied from the PC with scp (never printed or pasted); infra/.env created on the server; both chmod 600.
- 2026-10-08: `docker compose up -d --build` in ~/personal-os/infra. Caddy and server are up, the server is healthy, and https://adith-os.duckdns.org/api/v1/health returns {"status":"ok"} with a valid certificate. Random internet scanners already hit / (404), which is normal.
- Step 2 note: the server now also needs DATABASE_URL (Supabase session pooler) in its .env. Add it to apps/server/.env on the PC, and to ~/personal-os/apps/server/.env on the AWS server before the next redeploy, or the server will refuse to start. Step 2 is built and tested against the local server (VITE_API_URL=http://127.0.0.1:3000/api/v1); the AWS server is left alone until you redeploy.
- Next: point the desktop app at the server (VITE_API_URL), lock SSH to my IP, set the budget alert, choose the backup target, add Tailscale, then the deploy workflow and the final deployment guide.

AWS rules for this server: security group allows TCP 80 and 443 from anywhere (UDP 443 for HTTP/3) and TCP 22 from my IP only; port 3000 is never opened. Budget alert of about $5 in AWS Billing. Check that the account is on the Free plan and note the end date of the credits in the calendar.

## 1. Oracle Cloud server (planned later home, not set up yet)
AWS is current: see section 0.
- Account: Oracle Cloud Free Tier (https://www.oracle.com/cloud/free/), home region Mumbai (Hyderabad only if Mumbai has no ARM capacity at signup).
- Upgrade the account to Pay As You Go and stay inside Always Free limits, so idle instances are not reclaimed. Budget alert at ₹1.
- Instance: VM.Standard.A1.Flex (ARM), 2 OCPU, 12 GB RAM, Ubuntu 24.04.
- Network: security list allows TCP 22 (my IP), 80, 443. Host firewall (iptables) allows the same.
- SSH: key only.

## 2. Software on the host
- Docker Engine + Docker Compose plugin (ARM64). Installed on the AWS server.
- Tailscale (laptop and server in the same tailnet). Not installed yet (needed from Step 3).
- DuckDNS updater cron job (every 5 minutes). Not installed yet (the Elastic IP is fixed, so it matters little).

## 3. Docker Compose (infra/docker-compose.yml)
| Service | Image | Exposed |
|---|---|---|
| caddy | caddy | ports 80, 443 (public) |
| server | built from apps/server/Dockerfile (multi-stage, linux/arm64) | internal port 3000 |
| omniroute | OmniRoute pinned version (ARM64), added in Step 3 | internal port 20128, plus Tailscale IP only |

- Step 1 compose file contains only caddy and server. OmniRoute is added in Step 3 with a pinned version chosen then.
- caddy: `caddy:2.11.7-alpine`, publishes 80 and 443 (and 443/udp for HTTP/3), keeps its certificates in the `caddy_data` volume, and starts only after the server is healthy.
- server: built from `apps/server/Dockerfile`. The server is bundled into one JavaScript file on the build machine and only the small runtime image (`node:22-alpine`, non-root user `node`) is made for linux/arm64. It listens on port 3000 inside the Docker network only (never published), checks itself with `GET /api/v1/health`, and runs with a read-only filesystem, no extra Linux capabilities, and a 512 MB memory limit.
- Needs two files on the server that are never committed: `infra/.env` (`DUCKDNS_DOMAIN` is required by compose; `DUCKDNS_TOKEN` and the backup settings are used by the host scripts; see .env.example) and `apps/server/.env` (the server settings, including `SUPABASE_URL` and `DATABASE_URL`). Compose refuses to start if `DUCKDNS_DOMAIN` is missing.
- Server settings read by the code today: NODE_ENV, PORT (default 3000), HOST (default 127.0.0.1; the Docker image sets 0.0.0.0), LOG_LEVEL (default info), SUPABASE_URL, DATABASE_URL, and CORS_ORIGINS. The server refuses to start if SUPABASE_URL or DATABASE_URL still has an example value (replace-me, xxxx, yourname).
- Compose also sets the image tag `personal-os-server:local`, a tmpfs /tmp for the server, `cap_drop: ALL` and `no-new-privileges` on both services, and a `caddy_config` volume. The Dockerfile has its own HEALTHCHECK (wget on /api/v1/health), uses a BuildKit cache mount (BuildKit required), and the runtime image holds only the bundled index.js and its source map. A Docker build for arm64 can only be run on the ARM server (this PC has no QEMU).
- Start: `cd infra && docker compose up -d --build`. Check: open `https://<name>.duckdns.org/api/v1/health` in a browser; it should show `{"status":"ok", ...}`.

- OmniRoute data volume: omniroute-data, mounted at /app/data.
- OmniRoute settings: login required, API keys required for /v1.
- If the official OmniRoute image has no ARM64 build, build it from source with Node 22.

### Auto deploy (decision 69)
- `infra/scripts/auto-deploy.sh` runs from host cron every 5 minutes (line in `infra/scripts/cron.example`). When `origin/main` has a new commit it fast-forwards the clone, runs `docker compose up -d --build` in `infra/`, waits up to 3 minutes for the server container to be healthy and logs `OK deployed <sha>`. If the container is not healthy it goes back to the previous commit, rebuilds that, writes the bad commit to `~/.personal-os-deploy/failed` (it is not tried again until a newer commit arrives) and exits with an error. The server pulls with its read-only deploy key, so GitHub never logs in to the server and no deploy secret is stored in GitHub; locking SSH to your IP does not matter for it.
- It never applies migrations. If a deploy contains new files under `packages/db/drizzle` it logs a note; run `pnpm db:migrate` from your PC (until then the app shows "Database update needed").
- Only the `main` branch deploys (`DEPLOY_BRANCH` in `infra/.env` can change it). CI runs on every push but does not gate the deploy by itself: in GitHub, turn on a branch protection rule for `main` that requires the CI check, so only checked code reaches `main`.
- Set up once on the server: `chmod +x ~/personal-os/infra/scripts/auto-deploy.sh`, create the log folder (see cron.example), try `DRY_RUN=1 ~/personal-os/infra/scripts/auto-deploy.sh`, then add the cron line. The first run switches the clone from `step-1-foundation` to `main` (it refuses if the clone has local changes). Needs `apps/server/.env` (with `DATABASE_URL`) and `infra/.env` on the server. Check `/var/log/personal-os/deploy.log`.

### Redeploy (by hand)
- On the server: `cd ~/personal-os && git pull`, make sure apps/server/.env has the settings the new code needs (for example DATABASE_URL), then `cd infra && docker compose up -d --build`. The server reads apps/server/.env only when the container starts. Check /api/v1/health. To roll back, check out the previous commit and run the same compose command. The clone on the server is on branch step-1-foundation until a redeploy of Step 2 is done.

## 4. Caddyfile
- yourname.duckdns.org → reverse proxy to server:3000 with automatic HTTPS. No path rewriting: the server serves /api/v1/* itself.
- The name comes from `DUCKDNS_DOMAIN` in infra/.env (`{$DUCKDNS_DOMAIN}.duckdns.org`).
- Adds Strict-Transport-Security, X-Content-Type-Options and Referrer-Policy headers, removes the Server header, compresses responses, and checks the server's health. Caddy's access log hides the Authorization and Cookie headers.
- Ports 80 and 443 (and UDP 443 for HTTP/3) must be open in the cloud firewall (the AWS security group now, the Oracle security list later) and in the host firewall. Section 0 has the AWS rules.

## 5. Supabase
- Free plan project in the Mumbai region.
- DATABASE_URL uses the Supabase session pooler (IPv4, port 5432), because the direct connection is IPv6-only and the server host (AWS EC2 now, Oracle later) uses IPv4. The server refuses to start if DATABASE_URL is the direct connection (db.<ref>.supabase.co) or still has the example value. Copy it from Supabase → Connect → Session pooler.
- JWTs are verified with the project JWKS; no JWT secret is needed on the server.
- Run Drizzle migrations from the laptop: pnpm db:migrate.
- Create my one account (the app has no sign-up screen):
  1. Supabase dashboard → Authentication → Users → Add user → Create new user.
  2. Enter my email and a strong password, tick "Auto Confirm User", and create it.
- Disable public sign-ups: Authentication → Sign In / Providers → turn off "Allow new users to sign up" → Save.
- Check: signing in from the app works with my account, and a sign-up request through the API is rejected.
- Planned: once the scheduled jobs exist (Step 3 and later), their regular queries keep the free project from pausing. Until then the project can pause after a week of inactivity; open the dashboard or use the app to wake it.

## 6. Backups
- Settings in infra/.env: `BACKUP_DATABASE_URL` (the session pooler URL), `PG_MAJOR_VERSION`, `BACKUP_RETENTION_DAYS`, `OCI_BACKUP_BUCKET`, `OCI_REGION`, `OCI_S3_ENDPOINT`, `OCI_S3_ACCESS_KEY`, `OCI_S3_SECRET_KEY`. Create the S3 keys in the Oracle Console: your profile → Customer secret keys. The endpoint looks like `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`.
- Try it without changing anything: `DRY_RUN=1 infra/scripts/backup.sh` checks the settings and prints what it would do.
- The script verifies the dump can be read back before uploading, confirms the file is in the bucket afterwards, only deletes files named `personal-os-*.dump`, never prints secrets, and runs only one backup at a time.
- To restore: download a dump, then `pg_restore --no-owner --dbname "<database url>" personal-os-<time>.dump` using the same postgres major version.
- infra/scripts/backup.sh is written and tested but NOT yet scheduled on the AWS server (the backup target is not chosen yet). The settings are named OCI_* because the planned target is Oracle Object Storage, but the script works with any S3-compatible bucket if OCI_S3_ENDPOINT and the keys point to it. When scheduled it runs daily at 02:00 IST (host cron). It runs pg_dump from the official postgres Docker image whose major version matches the Supabase project (PG_MAJOR_VERSION, default 17), over the session pooler URL, compresses the file, uploads it with rclone to the bucket (personal-os-backups is only the example name in .env.example) through the S3-compatible API, and deletes backups older than 30 days.
- infra/scripts/duckdns-update.sh updates the DuckDNS record every 5 minutes (host cron). It needs `DUCKDNS_DOMAIN` and `DUCKDNS_TOKEN` in infra/.env, sends the token to curl through standard input so it never shows in a process list, and prints `OK` or `KO` with a UTC time.
- Cron lines for both scripts are in infra/scripts/cron.example. The server clock is UTC, so 02:00 IST is `30 20 * * *`.

## 7. Coding tools access (planned, Step 3)
- Claude Code and other coding tools point to http://<server-tailscale-ip>:20128/v1 with the coding key.

## 7a. Migrations and the startup check
- Migrations are applied only by the owner with `pnpm db:migrate`. The server never applies them.
- At startup the server reads the migration list in packages/db (the drizzle journal) and compares it with drizzle.__drizzle_migrations. If migrations are missing it logs a warning naming the files and "Database update needed: run pnpm db:migrate". Requests that fail because of it answer 503 `schema_behind` (not a 500), and the desktop app shows the same message.

## 7b. Git hooks and the docs check
- The repo has a commit-msg hook (.githooks/commit-msg) that runs `pnpm docs:check`: a commit that changes code listed in docs/doc-map.json must also change its docs, or carry a line `[docs-ok] <reason>` in the message.
- `pnpm install` turns the hook on by itself (the root `prepare` script runs scripts/install-hooks.mjs, which sets `git config core.hooksPath .githooks`). Run `pnpm hooks:install` to do it by hand. The script does nothing and never fails when there is no .git folder, so Docker builds and the AWS server are not affected.
- CI (.github/workflows/ci.yml) runs the same check over the pushed commits as a backstop.

## 8. Desktop app
- Built locally with Tauri (pnpm build:desktop) and installed on my computer.
