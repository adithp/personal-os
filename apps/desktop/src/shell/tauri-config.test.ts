// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readJson(relativePath: string): unknown {
  const path = fileURLToPath(new URL(`../../src-tauri/${relativePath}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

interface TauriConfig {
  app: { windows: { decorations: boolean; transparent: boolean; shadow: boolean }[] };
}
interface Capability {
  permissions: string[];
}

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
    expect(capability.permissions).toContain('core:window:allow-set-effects');
  });
});
