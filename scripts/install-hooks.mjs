#!/usr/bin/env node
// Turns on the repo's git hooks (.githooks/) for this clone: git config core.hooksPath .githooks.
// Does nothing, and never fails, when there is no git folder (for example inside a Docker build)
// or git is not installed. Runs by itself after `pnpm install` (the "prepare" script).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(join(root, '.git'))) {
  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
  } catch {
    // No git available: nothing to set up
  }
}
