#!/usr/bin/env node
// Checks that code changes come with doc changes (docs/doc-map.json). Plain Node, no libraries.
//
//   node scripts/docs-check.mjs                       staged changes (default)
//   node scripts/docs-check.mjs --range A..B          every commit in the range, one by one
//   node scripts/docs-check.mjs --range A..B --aggregate --ignore-docs-ok
//                                                     the range as ONE change (the feature as a whole)
//   node scripts/docs-check.mjs --commit-msg-file F   used by .githooks/commit-msg
//
// A commit can skip the check with a line "[docs-ok] <reason>" in its message.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** "[docs-ok] reason": the only way to skip the check. A reason is required. */
export const DOCS_OK = /\[docs-ok\]\s+\S+/i;

const escape = (text) => text.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/** A glob as a regular expression. {module} captures the module folder name. */
export function globToRegex(glob) {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 3;
    } else if (glob.startsWith('**', i)) {
      out += '.*';
      i += 2;
    } else if (glob.startsWith('{module}', i)) {
      out += '(?<module>[^/]+)';
      i += 8;
    } else if (glob[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else if (glob[i] === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += escape(glob[i] ?? '');
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

const matchesAny = (file, globs) => globs.some((glob) => globToRegex(glob).test(file));

/**
 * Finds the code changes whose docs were not touched.
 * files: changed paths (forward slashes). docMap: the parsed docs/doc-map.json.
 * An entry with includeIgnored also looks at files in the ignore list (used for docs that guard other docs).
 * dependenciesChanged(file): for a package.json, did its dependencies change?
 * Returns one violation per entry (and module): { entry, why, module, files, docs }.
 */
export function checkChanges({ files, docMap, dependenciesChanged = () => true }) {
  const ignored = (file) => matchesAny(file, docMap.ignore ?? []);
  const violations = [];

  for (const entry of docMap.entries) {
    const groups = new Map(); // module name ('' for none) -> matching files
    for (const file of files) {
      if (!entry.includeIgnored && ignored(file)) continue;
      for (const glob of entry.paths) {
        const match = globToRegex(glob).exec(file);
        if (!match) continue;
        if (entry.dependenciesOnly && !dependenciesChanged(file)) break;
        const key = match.groups?.module ?? '';
        groups.set(key, [...(groups.get(key) ?? []), file]);
        break;
      }
    }

    for (const [module, matched] of groups) {
      const docs = entry.docs.map((doc) => doc.replaceAll('{module}', module));
      const touched = files.some((file) => matchesAny(file, docs));
      if (!touched) {
        violations.push({ entry: entry.name, why: entry.why, module, files: matched, docs });
      }
    }
  }
  return violations;
}

export function formatViolations(violations, context = '') {
  const lines = [`docs-check: ${context}code changed without its docs.`.replace('  ', ' ')];
  for (const v of violations) {
    const label = v.module ? `${v.entry} (${v.module})` : v.entry;
    lines.push('', `- ${label}: ${v.why}`);
    lines.push(`    changed: ${v.files.slice(0, 4).join(', ')}${v.files.length > 4 ? ', …' : ''}`);
    lines.push(`    review (change at least one): ${v.docs.join(' or ')}`);
  }
  lines.push(
    '',
    'Update the docs so they match the code, or add a line to the commit message:',
    '  [docs-ok] <reason>   (only when the change has no behavior impact)',
  );
  return lines.join('\n');
}

const git = (args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const lines = (text) =>
  text === '' ? [] : text.split('\n').map((line) => line.replaceAll('\\', '/'));

/** The dependency sections of a package.json at a git revision ('' = the index), or null. */
function dependenciesAt(rev, file) {
  try {
    const json = JSON.parse(git(['show', `${rev}:${file}`]));
    return JSON.stringify([json.dependencies, json.devDependencies, json.peerDependencies]);
  } catch {
    return null;
  }
}

function stagedChange() {
  const files = lines(git(['diff', '--cached', '--name-only', '--diff-filter=ACMRD']));
  return {
    files,
    dependenciesChanged: (file) => dependenciesAt('', file) !== dependenciesAt('HEAD', file),
  };
}

function commitChange(commit) {
  const files = lines(git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', commit]));
  const parent = `${commit}^`;
  return {
    files,
    dependenciesChanged: (file) => dependenciesAt(commit, file) !== dependenciesAt(parent, file),
  };
}

function rangeChange(range) {
  const [from, to] = range.split('..');
  const files = lines(git(['diff', '--name-only', range]));
  return {
    files,
    dependenciesChanged: (file) =>
      dependenciesAt(to ?? 'HEAD', file) !== dependenciesAt(from, file),
  };
}

function main(argv) {
  const option = (name) => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const docMap = JSON.parse(readFileSync(join(ROOT, 'docs', 'doc-map.json'), 'utf8'));
  const range = option('--range');
  const messageFile = option('--commit-msg-file');
  const ignoreDocsOk = argv.includes('--ignore-docs-ok');

  // A commit being made: look at its message first
  if (messageFile !== undefined) {
    const message = readFileSync(messageFile, 'utf8');
    if (
      /^Merge /m.test(message.split('\n')[0] ?? '') ||
      existsSync(join(ROOT, '.git', 'MERGE_HEAD'))
    ) {
      return 0; // merge commits are checked per feature (docs-reviewer and the feature-wide check)
    }
    if (DOCS_OK.test(message)) return 0;
  }

  const failures = [];
  if (range !== undefined && !argv.includes('--aggregate')) {
    const commits = lines(git(['rev-list', '--no-merges', '--reverse', range]));
    for (const commit of commits) {
      const message = git(['log', '-1', '--format=%B', commit]);
      if (!ignoreDocsOk && DOCS_OK.test(message)) continue;
      const { files, dependenciesChanged } = commitChange(commit);
      const violations = checkChanges({ files, docMap, dependenciesChanged });
      if (violations.length > 0) {
        failures.push(formatViolations(violations, `commit ${commit.slice(0, 7)}: `));
      }
    }
  } else {
    const { files, dependenciesChanged } =
      range === undefined ? stagedChange() : rangeChange(range);
    const violations = checkChanges({ files, docMap, dependenciesChanged });
    if (violations.length > 0) {
      failures.push(formatViolations(violations, range === undefined ? '' : `${range}: `));
    }
  }

  if (failures.length > 0) {
    console.error(failures.join('\n\n'));
    return 1;
  }
  console.log('docs-check: ok');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
