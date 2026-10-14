#!/usr/bin/env bash
# One-time setup of the automatic deploy on the server (decision 69). Run it by hand, on the server,
# from the repository clone:   bash infra/scripts/setup-auto-deploy.sh
# It makes the scripts executable, creates the log and state folders, checks that the two env files
# exist, tries auto-deploy.sh with DRY_RUN=1 (changes nothing), and adds the cron line (once; running
# this again does not add it twice). It does not deploy anything by itself.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="${LOG_DIR:-$HOME/personal-os-logs}"
CRON_MARK="# personal-os auto deploy"

log() { printf '%s\n' "$*"; }

[[ -f "$REPO_DIR/apps/server/.env" ]] || { log "STOP: $REPO_DIR/apps/server/.env is missing (it needs SUPABASE_URL and DATABASE_URL)."; exit 1; }
# infra/.env (../.env from this folder) holds DUCKDNS_DOMAIN and the optional DEPLOY_* settings
[[ -f "$REPO_DIR/infra/.env" ]] || { log "STOP: $REPO_DIR/infra/.env is missing (it needs DUCKDNS_DOMAIN)."; exit 1; }
command -v docker >/dev/null || { log "STOP: docker is not installed or not in PATH."; exit 1; }
command -v flock >/dev/null || { log "STOP: flock is missing (sudo apt install util-linux)."; exit 1; }

chmod +x "$SCRIPT_DIR"/*.sh
mkdir -p "$LOG_DIR" "$HOME/.personal-os-deploy"

log "Trying a dry run (changes nothing):"
DRY_RUN=1 "$SCRIPT_DIR/auto-deploy.sh" || log "(the dry run reported a problem above: fix it before relying on the cron job)"

line="*/5 * * * * $SCRIPT_DIR/auto-deploy.sh >> $LOG_DIR/deploy.log 2>&1 $CRON_MARK"
current="$(crontab -l 2>/dev/null || true)"
if grep -qF "$CRON_MARK" <<<"$current"; then
  log "The cron line is already there."
else
  printf '%s\n%s\n' "$current" "$line" | sed '/^$/N;/^\n$/D' | crontab -
  log "Added the cron line: every 5 minutes, log in $LOG_DIR/deploy.log"
fi

log "Done. The next commit that reaches origin/main is deployed within about 5 minutes."
log "Watch it with:  tail -f $LOG_DIR/deploy.log"
