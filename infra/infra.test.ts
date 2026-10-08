// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Checks the deployment files without needing Docker (docs/DEPLOYMENT.md, docs/SECURITY.md).
 * The files were also validated with real Docker commands; see the Step 1 report.
 */

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8').replace(/\r\n/g, '\n');

const compose = read('infra/docker-compose.yml');
const caddyfile = read('infra/Caddyfile');
const dockerfile = read('apps/server/Dockerfile');
const dockerignore = read('.dockerignore');
const backup = read('infra/scripts/backup.sh');
const duckdns = read('infra/scripts/duckdns-update.sh');
const cron = read('infra/scripts/cron.example');
const envExample = read('.env.example');

/** The text of one service in docker-compose.yml. */
function service(name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`);
  expect(start, `service ${name}`).toBeGreaterThan(-1);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z_]+:\n|\n[a-z_]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('docker-compose.yml', () => {
  it('has only the caddy and server services for now (OmniRoute comes in Step 3)', () => {
    const names = [...compose.matchAll(/^ {2}([a-z_]+):\n/gm)].map((m) => m[1]);
    const services = names.filter((name) => name === 'caddy' || name === 'server');
    expect(services).toEqual(['caddy', 'server']);
    // OmniRoute is only mentioned in a comment; there must be no service for it yet
    expect(compose).not.toMatch(/^ {2}omniroute:/m);
  });

  it('publishes only ports 80 and 443 and only on caddy', () => {
    const published = [...compose.matchAll(/- '(\d+):(\d+)(\/udp)?'/g)].map((m) => m[1] ?? '');
    expect(new Set(published)).toEqual(new Set(['80', '443']));
    expect(service('caddy')).toContain('ports:');
    expect(service('server')).not.toContain('ports:');
  });

  it('keeps the server internal: exposed to Caddy only', () => {
    expect(service('server')).toMatch(/expose:\n\s+- '3000'/);
  });

  it('uses pinned image versions, never latest', () => {
    const images = [...compose.matchAll(/^\s+image:\s*(\S+)/gm)].map((m) => m[1] ?? '');
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toMatch(/:.+/);
      expect(image).not.toMatch(/:latest$/);
    }
    expect(service('caddy')).toContain('image: caddy:2.11.7-alpine');
  });

  it('builds the server for linux/arm64 from the Dockerfile in apps/server', () => {
    const server = service('server');
    expect(server).toContain('dockerfile: apps/server/Dockerfile');
    expect(server).toContain('context: ..');
    expect(server).toContain('- linux/arm64');
  });

  it('starts Caddy only after the server is healthy, and checks /api/v1/health', () => {
    expect(service('caddy')).toMatch(/depends_on:\n\s+server:\n\s+condition: service_healthy/);
    expect(service('server')).toContain('http://127.0.0.1:3000/api/v1/health');
  });

  it('restarts both services automatically', () => {
    expect(service('caddy')).toContain('restart: unless-stopped');
    expect(service('server')).toContain('restart: unless-stopped');
  });

  it('hardens both services', () => {
    for (const name of ['caddy', 'server']) {
      expect(service(name)).toContain('cap_drop:\n      - ALL');
      expect(service(name)).toContain('no-new-privileges:true');
    }
    expect(service('server')).toContain('read_only: true');
  });

  it('gets secrets from env files outside the repository history, not from the compose file', () => {
    expect(service('server')).toContain('../apps/server/.env');
    expect(compose).not.toMatch(/(SECRET|TOKEN|PASSWORD|SERVICE_ROLE)[A-Z_]*:\s*\S+/);
  });

  it('refuses to start without DUCKDNS_DOMAIN', () => {
    expect(compose).toContain('${DUCKDNS_DOMAIN:?');
  });

  it('keeps the certificates in a volume', () => {
    expect(compose).toContain('caddy_data:/data');
  });
});

describe('Caddyfile', () => {
  it('serves the DuckDNS name from infra/.env with automatic HTTPS', () => {
    expect(caddyfile).toContain('{$DUCKDNS_DOMAIN}.duckdns.org {');
    expect(caddyfile).not.toMatch(/^\s*http:\/\//m);
    expect(caddyfile).not.toMatch(/auto_https\s+off/);
  });

  it('proxies to the server on port 3000 and checks its health', () => {
    expect(caddyfile).toContain('reverse_proxy server:3000');
    expect(caddyfile).toContain('health_uri /api/v1/health');
  });

  it('does not rewrite paths: the server serves /api/v1 itself (decision 14)', () => {
    for (const directive of [
      'rewrite',
      'uri strip_prefix',
      'uri replace',
      'handle_path',
      'route /',
    ]) {
      expect(caddyfile).not.toContain(directive);
    }
  });

  it('adds security headers and hides the server name', () => {
    expect(caddyfile).toContain('Strict-Transport-Security');
    expect(caddyfile).toContain('X-Content-Type-Options "nosniff"');
    expect(caddyfile).toContain('-Server');
  });

  it('never logs credentials', () => {
    expect(caddyfile).not.toMatch(/log_credentials/i);
    expect(caddyfile).not.toMatch(/debug/i);
  });
});

describe('server Dockerfile', () => {
  it('is a multi-stage build', () => {
    expect([...dockerfile.matchAll(/^FROM /gm)].length).toBeGreaterThanOrEqual(3);
    expect(dockerfile).toMatch(/FROM .* AS runtime/);
  });

  it('uses a pinned Node 22 image for every stage', () => {
    const stages = [...dockerfile.matchAll(/ AS (\w+)$/gm)].map((m) => m[1] ?? '');
    const images = [...dockerfile.matchAll(/^FROM (?:--platform=\S+ )?(\S+)/gm)]
      .map((m) => m[1] ?? '')
      .filter((image) => !stages.includes(image)); // "FROM deps" builds on an earlier stage
    expect(images.length).toBeGreaterThanOrEqual(2);
    for (const image of images) {
      expect(image).toMatch(/^node:22\.\d+\.\d+-alpine$/);
    }
  });

  it('builds on the build machine and produces a runtime image for the target platform', () => {
    expect(dockerfile).toContain('--platform=$BUILDPLATFORM');
    expect(dockerfile).toMatch(/FROM node:22\.\d+\.\d+-alpine AS runtime/);
  });

  it('installs exactly what the lockfile says', () => {
    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    expect(dockerfile).toContain('pnpm-lock.yaml');
  });

  it('runs as the non-root node user with a health check', () => {
    const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
    expect(runtime).toContain('USER node');
    expect(runtime).toContain('HEALTHCHECK');
    expect(runtime).not.toMatch(/USER root/);
  });

  it('puts only the built bundle in the runtime image, and never an env file', () => {
    const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
    const copies = [...runtime.matchAll(/^COPY .*$/gm)].map((m) => m[0]);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toContain('apps/server/dist/index.js');
    expect(dockerfile).not.toMatch(/COPY .*\.env/);
  });

  it('listens on all interfaces inside the container, in production mode', () => {
    expect(dockerfile).toContain('ENV HOST=0.0.0.0');
    expect(dockerfile).toContain('ENV NODE_ENV=production');
    expect(dockerfile).toContain('CMD ["node"');
  });
});

describe('.dockerignore', () => {
  it('keeps secrets, dependencies, and build output out of the image context', () => {
    for (const entry of ['.git', '**/node_modules', '**/.env', '**/target']) {
      expect(dockerignore).toContain(entry);
    }
    expect(dockerignore).toContain('!**/.env.example');
  });
});

describe.each([
  ['backup.sh', backup],
  ['duckdns-update.sh', duckdns],
])('%s', (_name, script) => {
  it('is a bash script that stops on errors, with Unix line endings', () => {
    expect(script.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(script).toContain('set -euo pipefail');
    expect(script).not.toContain('\r');
  });

  it('never turns on command tracing, which would print secrets', () => {
    expect(script).not.toMatch(/set\s+-[a-z]*x/);
    expect(script).not.toMatch(/bash\s+-x/);
  });

  it('never prints a secret', () => {
    const lines = script.split('\n');
    const secret = /\$\{?(DUCKDNS_TOKEN|BACKUP_DATABASE_URL|OCI_S3_SECRET_KEY|OCI_S3_ACCESS_KEY)\b/;
    lines.forEach((line, index) => {
      if (!/^\s*(echo|printf|log|die)\b/.test(line) || line.trim().startsWith('#')) return;
      if (!secret.test(line)) return;
      // The one allowed case: the DuckDNS URL is piped straight into curl and never shown
      expect(lines[index + 1] ?? '', `line ${String(index + 1)} prints a secret`).toMatch(
        /\|\s*curl\b/,
      );
    });
  });

  it('reads its settings from infra/.env', () => {
    expect(script).toContain('../.env');
  });
});

describe('backup.sh', () => {
  it('runs pg_dump in a postgres container whose version comes from PG_MAJOR_VERSION (default 17)', () => {
    expect(backup).toContain('PG_MAJOR_VERSION="${PG_MAJOR_VERSION:-17}"');
    expect(backup).toContain('POSTGRES_IMAGE="postgres:${PG_MAJOR_VERSION}-alpine"');
    expect(backup).toContain('pg_dump --format=custom');
  });

  it('uploads with a pinned rclone image through the S3-compatible API', () => {
    expect(backup).toContain('RCLONE_IMAGE="rclone/rclone:1.75.1"');
    expect(backup).toContain('RCLONE_CONFIG_OCI_TYPE=s3');
    expect(backup).toContain('OCI_S3_ENDPOINT');
  });

  it('keeps 30 days by default and deletes only its own backup files', () => {
    expect(backup).toContain('BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"');
    expect(backup).toContain("--include 'personal-os-*.dump'");
    expect(backup).toContain('--min-age');
  });

  it('checks the dump before uploading and the upload afterwards', () => {
    expect(backup).toContain('pg_restore --list');
    expect(backup).toContain('lsf');
    expect(backup.indexOf('pg_restore --list')).toBeLessThan(backup.indexOf('copyto'));
  });

  it('never runs two backups at once, and cleans up its temporary files', () => {
    expect(backup).toContain('flock -n');
    expect(backup).toContain('trap \'rm -rf "$workdir"\' EXIT');
  });

  it('passes secrets to containers as environment variables, not on the command line', () => {
    expect(backup).toContain('-e BACKUP_DATABASE_URL');
    expect(backup).toContain('-e RCLONE_CONFIG_OCI_SECRET_ACCESS_KEY');
    // The URL is expanded by the shell INSIDE the container (single quotes), never on the host
    expect(backup).toMatch(/sh -c '[^']*--dbname "\$BACKUP_DATABASE_URL"[^']*'/);
    // rclone keys must not be passed as flags, where `ps` would show them
    expect(backup).not.toMatch(/--s3-(secret-access-key|access-key-id)/);
  });

  it('has a dry run that changes nothing', () => {
    expect(backup).toContain('DRY_RUN');
    const dryRunBlock = backup.slice(
      backup.indexOf('if [[ "$DRY_RUN"'),
      backup.indexOf('command -v docker'),
    );
    expect(dryRunBlock).toContain('exit 0');
    expect(dryRunBlock).not.toContain('docker run');
  });
});

describe('duckdns-update.sh', () => {
  it('hides the token from the process list by sending the URL through standard input', () => {
    expect(duckdns).toContain('--config -');
    expect(duckdns).not.toMatch(/curl[^\n]*duckdns\.org/);
  });

  it('only accepts safe characters in the name and token', () => {
    expect(duckdns).toContain('^[a-z0-9-]+$');
    expect(duckdns).toContain('^[A-Za-z0-9-]+$');
  });

  it('prints OK or KO and fails unless DuckDNS said OK', () => {
    expect(duckdns).toContain('"$response" == "OK"');
    expect(duckdns).toContain('log "OK');
    expect(duckdns).toContain('log "KO');
  });
});

describe('cron.example', () => {
  it('updates DuckDNS every 5 minutes', () => {
    expect(cron).toMatch(/^\*\/5 \* \* \* \* \S*duckdns-update\.sh/m);
  });

  it('backs up at 02:00 India time, which is 20:30 UTC on the server', () => {
    expect(cron).toMatch(/^30 20 \* \* \* \S*backup\.sh/m);
    expect(cron).toContain('02:00 India time');
  });
});

describe('.env.example has every setting the infra files need', () => {
  it.each([
    'DUCKDNS_DOMAIN',
    'DUCKDNS_TOKEN',
    'OCI_BACKUP_BUCKET',
    'BACKUP_DATABASE_URL',
    'PG_MAJOR_VERSION',
    'BACKUP_RETENTION_DAYS',
    'OCI_REGION',
    'OCI_S3_ENDPOINT',
    'OCI_S3_ACCESS_KEY',
    'OCI_S3_SECRET_KEY',
    'SUPABASE_URL',
  ])('%s', (name) => {
    expect(envExample).toMatch(new RegExp(`^#?\\s*${name}=`, 'm'));
  });

  it('uses the Supabase session pooler for the database URL (IPv4)', () => {
    expect(envExample).toContain('pooler.supabase.com');
  });

  it('does not contain the removed JWT secret', () => {
    expect(envExample).not.toContain('SUPABASE_JWT_SECRET');
  });
});
