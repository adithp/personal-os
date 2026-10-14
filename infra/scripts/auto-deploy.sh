#!/usr/bin/env bash
# Deploys new commits of the main branch on this server by itself (decision 69). Host cron runs it
# every 5 minutes. The server pulls from GitHub with its read-only deploy key; nothing logs in to
# the server and no secret is stored in GitHub.
#
# What it does when origin/main has a new commit:
#   1. checks that apps/server/.env and infra/.env exist and the clone has no local changes
#   2. fast-forwards the clone to origin/main
#   3. rebuilds and restarts with docker compose (infra/docker-compose.yml)
#   4. waits for the server container to be healthy; if it is not, goes back to the previous
#      commit, rebuilds that, and remembers the bad commit so it is not tried again every 5 minutes
# It NEVER applies database migrations (the owner runs pnpm db:migrate); it only logs when a
# deploy brings new migration files.
#
# Optional settings (infra/.env or the environment): DEPLOY_BRANCH (default main),
# DEPLOY_STATE_DIR (default ~/.personal-os-deploy), DEPLOY_WAIT_SECONDS (default 180).
# Try it without changing anything:  DRY_RUN=1 infra/scripts/auto-deploy.sh

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"
STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/.personal-os-deploy}"
WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-180}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || { log "KO DEPLOY_BRANCH has unexpected characters"; exit 1; }
mkdir -p "$STATE_DIR"

# Only one deploy at a time
exec 9>"$STATE_DIR/lock"
flock -n 9 || { log "skip: another deploy is still running"; exit 0; }

cd "$REPO_DIR"
[[ -f apps/server/.env ]] || { log "KO apps/server/.env is missing"; exit 1; }
[[ -f infra/.env ]] || { log "KO infra/.env is missing"; exit 1; }
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  log "KO the clone has local changes; not deploying"
  exit 1
fi

git fetch --quiet origin "$BRANCH"
remote="$(git rev-parse "origin/$BRANCH")"
current="$(git rev-parse HEAD)"
current_ref="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$remote" == "$current" && "$current_ref" == "$BRANCH" ]]; then
  exit 0 # up to date
fi
if [[ "$remote" == "$(cat "$STATE_DIR/failed" 2>/dev/null || true)" ]]; then
  exit 0 # this commit already failed; wait for a newer one
fi

log "new commit on $BRANCH: ${remote:0:9} (running ${current:0:9})"
if [[ "${DRY_RUN:-}" == "1" ]]; then
  log "DRY_RUN: would fast-forward to ${remote:0:9} and run docker compose up -d --build"
  exit 0
fi

if [[ -n "$(git diff --name-only "$current" "$remote" -- packages/db/drizzle 2>/dev/null || true)" ]]; then
  log "NOTE this deploy brings new database migrations: run pnpm db:migrate from your PC (until then the app answers schema_behind)"
fi

previous_ref="$current_ref"
[[ "$previous_ref" != "HEAD" ]] || previous_ref="$current"

git checkout --quiet "$BRANCH" 2>/dev/null || git checkout --quiet -b "$BRANCH" "origin/$BRANCH"
git merge --ff-only --quiet "origin/$BRANCH"

compose_up() { (cd "$REPO_DIR/infra" && docker compose up -d --build --quiet-pull); }

wait_healthy() {
  local container status waited=0
  while ((waited < WAIT_SECONDS)); do
    container="$(cd "$REPO_DIR/infra" && docker compose ps -q server 2>/dev/null || true)"
    if [[ -n "$container" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"
      [[ "$status" == "healthy" ]] && return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

if compose_up && wait_healthy; then
  rm -f "$STATE_DIR/failed"
  docker image prune -f >/dev/null 2>&1 || true
  log "OK deployed ${remote:0:9}"
  exit 0
fi

log "KO the server did not become healthy on ${remote:0:9}; going back to ${current:0:9}"
printf '%s\n' "$remote" >"$STATE_DIR/failed"
git checkout --quiet "$previous_ref"
if compose_up && wait_healthy; then
  log "OK rolled back to ${current:0:9}"
else
  log "KO rollback did not become healthy either: check the server by hand"
fi
exit 1
