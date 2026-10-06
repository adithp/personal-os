# Deployment

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

- OmniRoute data volume: omniroute-data, mounted at /app/data.
- OmniRoute settings: login required, API keys required for /v1.
- If the official OmniRoute image has no ARM64 build, build it from source with Node 22.

## 4. Caddyfile
- yourname.duckdns.org → reverse proxy to server:3000 with automatic HTTPS. No path rewriting: the server serves /api/v1/* itself.

## 5. Supabase
- Free plan project in the Mumbai region.
- DATABASE_URL uses the Supabase session pooler (IPv4, port 5432), because the direct connection is IPv6-only and the Oracle VM uses IPv4. Copy it from Supabase → Connect → Session pooler.
- JWTs are verified with the project JWKS; no JWT secret is needed on the server.
- Run Drizzle migrations from the laptop: pnpm db:migrate.
- Disable public sign-ups after creating my account.
- The backend's scheduled jobs keep the project active, so the free project does not pause.

## 6. Backups
- infra/scripts/backup.sh runs daily at 02:00 IST (host cron). It runs pg_dump from the official postgres Docker image whose major version matches the Supabase project (PG_MAJOR_VERSION, default 17), over the session pooler URL, compresses the file, uploads it with rclone to the Oracle Object Storage bucket personal-os-backups through the S3-compatible API, and deletes backups older than 30 days.
- infra/scripts/duckdns-update.sh updates the DuckDNS record every 5 minutes (host cron).

## 7. Coding tools access
- Claude Code and other coding tools point to http://<server-tailscale-ip>:20128/v1 with the coding key.

## 8. Desktop app
- Built locally with Tauri (pnpm build:desktop) and installed on my computer.
