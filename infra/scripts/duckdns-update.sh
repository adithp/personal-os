#!/usr/bin/env bash
# Keeps the DuckDNS name pointing at this server's public IP. Host cron runs it every 5 minutes.
# Settings (infra/.env): DUCKDNS_DOMAIN (just the name, e.g. "yourname") and DUCKDNS_TOKEN.
# The token is sent to curl through standard input, so it never appears in a process list or a log.
#
# Prints "OK" or "KO" with a UTC time. Exit code 0 only when DuckDNS answered OK.

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

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

[[ -n "${DUCKDNS_DOMAIN:-}" ]] || { log "KO missing DUCKDNS_DOMAIN"; exit 1; }
[[ -n "${DUCKDNS_TOKEN:-}" ]] || { log "KO missing DUCKDNS_TOKEN"; exit 1; }
[[ "$DUCKDNS_DOMAIN" =~ ^[a-z0-9-]+$ ]] || { log "KO DUCKDNS_DOMAIN must be the name only (letters, digits, dashes)"; exit 1; }
[[ "$DUCKDNS_TOKEN" =~ ^[A-Za-z0-9-]+$ ]] || { log "KO DUCKDNS_TOKEN has unexpected characters"; exit 1; }

# An empty ip= makes DuckDNS use the address the request comes from
response="$(
  printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip="\n' "$DUCKDNS_DOMAIN" "$DUCKDNS_TOKEN" \
    | curl --silent --show-error --max-time 20 --retry 2 --config - 2>/dev/null || true
)"

if [[ "$response" == "OK" ]]; then
  log "OK ${DUCKDNS_DOMAIN}.duckdns.org updated"
else
  log "KO DuckDNS did not accept the update"
  exit 1
fi
