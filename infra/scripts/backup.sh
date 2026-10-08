#!/usr/bin/env bash
# Nightly database backup for Personal OS.
#
#   1. pg_dump runs in an official postgres container whose major version matches Supabase
#      (PG_MAJOR_VERSION, default 17), over the Supabase session pooler.
#   2. The dump is checked, then uploaded with rclone (also in a container) to the Oracle Object
#      Storage bucket through its S3-compatible API.
#   3. Backups older than BACKUP_RETENTION_DAYS (default 30) are deleted from the bucket.
#
# Settings come from infra/.env (see .env.example). Secrets are passed to containers as
# environment variables, never on a command line, and are never printed.
#
# Try it without touching anything:  DRY_RUN=1 infra/scripts/backup.sh
# Host cron (see cron.example) runs it at 02:00 India time.

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

PG_MAJOR_VERSION="${PG_MAJOR_VERSION:-17}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
POSTGRES_IMAGE="postgres:${PG_MAJOR_VERSION}-alpine"
RCLONE_IMAGE="rclone/rclone:1.75.1"
LOCK_FILE="${LOCK_FILE:-/tmp/personal-os-backup.lock}"
DRY_RUN="${DRY_RUN:-0}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# ---- check settings (names only: values are secrets) ----------------------------------------
missing=()
for name in BACKUP_DATABASE_URL OCI_BACKUP_BUCKET OCI_S3_ENDPOINT OCI_REGION OCI_S3_ACCESS_KEY OCI_S3_SECRET_KEY; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
((${#missing[@]} == 0)) || die "missing settings: ${missing[*]} (see infra/.env)"

[[ "$PG_MAJOR_VERSION" =~ ^[0-9]{2}$ ]] || die "PG_MAJOR_VERSION must be a two-digit number such as 17"
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ && "$BACKUP_RETENTION_DAYS" -ge 1 ]] || die "BACKUP_RETENTION_DAYS must be a whole number of days, at least 1"
[[ "$OCI_BACKUP_BUCKET" =~ ^[A-Za-z0-9._-]+$ ]] || die "OCI_BACKUP_BUCKET has characters a bucket name cannot have"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="personal-os-${timestamp}.dump"

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY RUN: settings look complete. Nothing was dumped, uploaded, or deleted."
  log "Would run pg_dump in ${POSTGRES_IMAGE} (custom format, compressed)"
  log "Would upload ${file} to bucket ${OCI_BACKUP_BUCKET} with ${RCLONE_IMAGE}"
  log "Would delete personal-os-*.dump older than ${BACKUP_RETENTION_DAYS} days from the bucket"
  exit 0
fi

command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH"

# ---- only one backup at a time ---------------------------------------------------------------
exec 9>"$LOCK_FILE"
flock -n 9 || die "another backup is already running"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# ---- 1. dump ---------------------------------------------------------------------------------
log "Dumping the database with ${POSTGRES_IMAGE}"
export BACKUP_DATABASE_URL
docker run --rm -e BACKUP_DATABASE_URL "$POSTGRES_IMAGE" \
  sh -c 'pg_dump --format=custom --compress=9 --no-owner --no-privileges --dbname "$BACKUP_DATABASE_URL"' \
  >"$workdir/$file" || die "pg_dump failed"

[[ -s "$workdir/$file" ]] || die "the dump is empty"
docker run --rm -i "$POSTGRES_IMAGE" pg_restore --list <"$workdir/$file" >/dev/null \
  || die "the dump cannot be read back, so it was NOT uploaded"
log "Dump OK ($(wc -c <"$workdir/$file") bytes)"

# ---- 2. upload (rclone configured entirely through environment variables) --------------------
export RCLONE_CONFIG_OCI_TYPE=s3
export RCLONE_CONFIG_OCI_PROVIDER=Other
export RCLONE_CONFIG_OCI_ENDPOINT="$OCI_S3_ENDPOINT"
export RCLONE_CONFIG_OCI_REGION="$OCI_REGION"
export RCLONE_CONFIG_OCI_ACCESS_KEY_ID="$OCI_S3_ACCESS_KEY"
export RCLONE_CONFIG_OCI_SECRET_ACCESS_KEY="$OCI_S3_SECRET_KEY"
export RCLONE_CONFIG_OCI_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_OCI_NO_CHECK_BUCKET=true

rclone_run() {
  docker run --rm -v "$workdir:/data:ro" \
    -e RCLONE_CONFIG_OCI_TYPE -e RCLONE_CONFIG_OCI_PROVIDER -e RCLONE_CONFIG_OCI_ENDPOINT \
    -e RCLONE_CONFIG_OCI_REGION -e RCLONE_CONFIG_OCI_ACCESS_KEY_ID \
    -e RCLONE_CONFIG_OCI_SECRET_ACCESS_KEY -e RCLONE_CONFIG_OCI_FORCE_PATH_STYLE \
    -e RCLONE_CONFIG_OCI_NO_CHECK_BUCKET \
    "$RCLONE_IMAGE" "$@"
}

log "Uploading ${file} to bucket ${OCI_BACKUP_BUCKET}"
rclone_run copyto "/data/$file" "oci:${OCI_BACKUP_BUCKET}/${file}" || die "upload failed"
rclone_run lsf "oci:${OCI_BACKUP_BUCKET}/${file}" | grep -qx "$file" || die "the uploaded file is not in the bucket"
log "Upload OK"

# ---- 3. keep only the last BACKUP_RETENTION_DAYS days ----------------------------------------
log "Deleting backups older than ${BACKUP_RETENTION_DAYS} days"
rclone_run delete "oci:${OCI_BACKUP_BUCKET}" --include 'personal-os-*.dump' --min-age "${BACKUP_RETENTION_DAYS}d" \
  || die "could not delete old backups (the new backup is safe)"

log "Backup finished: ${file}"
