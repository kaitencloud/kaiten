#!/usr/bin/env node
// Checks what the published tarball holds, as `pnpm pack` builds it (what the
// release workflow publishes) and as `npm pack` builds it:
//
//   - every file the package promises: package.json, README.md, LICENSE, NOTICE,
//     dist/index.mjs and the four stylesheets, plus whatever `types` and `exports`
//     point at;
//   - nothing internal: no src/, scripts/ or .changeset/, no token partial, and no
//     CHANGELOG.md, whose history links to internal repositories;
//   - no comment in any stylesheet;
//   - no `catalog:` or `workspace:` specifier in the packed package.json: pnpm
//     writes the real ranges there, where `npm pack` would ship them as is;
//   - the same file list from both packers.
//
// The stylesheets are written by the `build:done` hook in vite.config.ts, after
// `vp pack` has validated its own output, so no packaging tool ever looks at them.
// This is the check that does. Run it after `pnpm run build`.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const relative = (target) => target.replace(/^\.\//, '');

const required = new Set([
  'package.json',
  'README.md',
  'LICENSE',
  'NOTICE',
  'dist/index.mjs',
  'dist/global.css',
  'dist/theme-inline.css',
  'dist/scoped.css',
  'dist/theme-inline-scoped.css',
]);
if (manifest.types) required.add(relative(manifest.types));
for (const target of Object.values(manifest.exports ?? {}))
  required.add(relative(target));

const internal = [
  /^src\//,
  /^scripts\//,
  /^\.changeset\//,
  /^CHANGELOG/i,
  /\.partial\.css$/,
];

const dir = mkdtempSync(join(tmpdir(), 'kaiten-theme-pack-'));
try {
  execFileSync('pnpm', ['pack', '--pack-destination', dir], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const tarball = readdirSync(dir).find((file) => file.endsWith('.tgz'));
  if (!tarball) throw new Error('pnpm pack produced no tarball');
  const files = execFileSync('tar', ['-tzf', join(dir, tarball)], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .map((path) => path.replace(/^package\//, ''))
    .sort();
  execFileSync('tar', ['-xzf', join(dir, tarball), '-C', dir]);

  const npmFiles = JSON.parse(
    execFileSync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts', '--loglevel=error'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    ),
  )[0]
    .files.map((file) => file.path)
    .sort();

  const problems = [];
  for (const file of required) {
    if (!files.includes(file)) problems.push(`missing: ${file}`);
  }
  for (const file of files) {
    if (internal.some((pattern) => pattern.test(file)))
      problems.push(`must not ship: ${file}`);
  }
  for (const file of files.filter((name) => name.endsWith('.css'))) {
    if (readFileSync(join(dir, 'package', file), 'utf8').includes('/*')) {
      problems.push(`comment in ${file}`);
    }
  }
  const packed = JSON.parse(
    readFileSync(join(dir, 'package', 'package.json'), 'utf8'),
  );
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    for (const [name, spec] of Object.entries(packed[field] ?? {})) {
      if (/^(catalog|workspace):/.test(spec)) {
        problems.push(`unresolved specifier: ${field}.${name} is ${spec}`);
      }
    }
  }
  if (npmFiles.join('\n') !== files.join('\n')) {
    problems.push(
      `npm pack ships a different file list:\n    pnpm: ${files.join(', ')}\n    npm:  ${npmFiles.join(', ')}`,
    );
  }

  console.log(`${tarball}\n${files.map((file) => `  ${file}`).join('\n')}\n`);
  if (problems.length > 0) {
    console.error(
      `✗ The tarball is not what the package promises:\n  ${problems.join('\n  ')}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `✓ ${files.length} files: all ${required.size} promised, nothing internal, no CSS comment, no unresolved specifier; npm pack agrees`,
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
