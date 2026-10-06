// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readJson(relativePath: string): unknown {
  const path = fileURLToPath(new URL(`../../src-tauri/${relativePath}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

interface TauriConfig {
  app: {
    windows: { decorations: boolean; transparent: boolean; shadow: boolean }[];
    security: { assetProtocol: { enable: boolean; scope: string[] } };
  };
}
type Permission = string | { identifier: string; allow?: { path: string }[] };
interface Capability {
  permissions: Permission[];
}

const identifier = (permission: Permission) =>
  typeof permission === 'string' ? permission : permission.identifier;

describe('Tauri window configuration', () => {
  const config = readJson('tauri.conf.json') as TauriConfig;
  const capability = readJson('capabilities/default.json') as Capability;

  it('has a frameless, transparent window so the desktop can show through', () => {
    const [window] = config.app.windows;
    expect(window?.decorations).toBe(false);
    expect(window?.transparent).toBe(true);
  });

  it('has no window shadow, which can leave artifacts on transparent windows', () => {
    expect(config.app.windows[0]?.shadow).toBe(false);
  });

  it('allows the page to set and clear window effects', () => {
    expect(capability.permissions.map(identifier)).toContain('core:window:allow-set-effects');
  });
});

describe('Wallpaper image permissions', () => {
  const config = readJson('tauri.conf.json') as TauriConfig;
  const capability = readJson('capabilities/default.json') as Capability;
  const scoped = capability.permissions.filter(
    (permission): permission is Exclude<Permission, string> => typeof permission !== 'string',
  );

  it('lets the user pick a file with the open dialog', () => {
    expect(capability.permissions.map(identifier)).toContain('dialog:allow-open');
  });

  it('only allows creating, copying, and deleting inside the app wallpapers folder', () => {
    const writes = scoped.filter((permission) => permission.identifier.startsWith('fs:'));
    expect(writes.map((permission) => permission.identifier).sort()).toEqual([
      'fs:allow-copy-file',
      'fs:allow-mkdir',
      'fs:allow-remove',
    ]);
    for (const permission of writes) {
      for (const rule of permission.allow ?? []) {
        expect(rule.path).toMatch(/^\$APPDATA\/wallpapers(\/\*)?$/);
      }
      expect(permission.allow?.length).toBeGreaterThan(0);
    }
  });

  it('does not allow reading or writing arbitrary files', () => {
    const ids = capability.permissions.map(identifier);
    for (const forbidden of [
      'fs:default',
      'fs:allow-write-file',
      'fs:allow-read-file',
      'fs:scope',
    ]) {
      expect(ids).not.toContain(forbidden);
    }
  });

  it('shows the stored image through the asset protocol, only from the wallpapers folder', () => {
    expect(config.app.security.assetProtocol).toEqual({
      enable: true,
      scope: ['$APPDATA/wallpapers/**'],
    });
  });
});
