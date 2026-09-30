#!/usr/bin/env node
// Fails when @kaitencloud/theme's SOURCE tokens differ from the tarball already
// published at the SAME version: a token change reaches no one until the version
// in package.json moves.
//
// Why this exists: 0.3.3 was published, the palette was then rewritten in
// `src/styles/*.partial.css`, and no changeset was ever added. Two different
// stylesheets therefore both answered to "@kaitencloud/theme@0.3.3" — the one in
// the source and the one the Kaiten app installed — and nothing compared them.
// The gap was found by hand, months late, from a rendered pixel: DESIGN.md
// documented `--warning: #cf4a03` with white ink while the app still painted the
// old amber with dark ink.
//
// The failure mode this guards is NOT "source and registry differ" — that is the
// normal state of any package between a change and its release. It is "source and
// registry differ AND nothing will ever reconcile them", i.e. a token edit with no
// version bump behind it. That edit is invisible: it passes review, passes CI, merges,
// and then simply never reaches a consumer. So the rule is:
//
//     tokens differ from the published same-version tarball
//         => the version in package.json must be bumped
//
// Missing and added tokens are reported as loudly as changed ones, deliberately.
// The drift that actually hurt was `--warning-subtle`, which existed in source and
// was ABSENT from the published build — so every `*-warning-subtle*` utility in the
// app compiled to an unresolvable `var()` and painted transparent. A check that
// only compares tokens present on both sides is blind to exactly the case that
// bites, because a token missing from one side is silently skipped rather than
// reported.
//
// Only the two token partials and the Tailwind mapping are compared. The scoped
// `.kaiten` build is generated from those same partials by scripts/generate-css.ts,
// so it cannot drift independently of them.
//
// Tokens are compared as parsed `--name: value` declarations, never as bytes. The
// CSS published on npm has its comments stripped (the builds once published on
// GitHub Packages kept them), so the published files never match the partials'
// text, and are not meant to.
//
// The tarball is fetched anonymously from registry.npmjs.org, the one registry this
// package is published to: no token and no .npmrc, so a user-level scope mapping
// to another registry cannot change what is compared. Outcomes:
//
//   - the version in package.json is published: compare, as described above;
//   - the package exists but not at that version: a release is pending, since
//     release-theme.yml publishes every version the registry lacks. Nothing can be
//     compared at that version, and the check passes, saying so;
//   - the package has never been published, or the registry cannot be reached:
//     the check SKIPS with a warning rather than passing quietly. Set
//     KAITEN_REQUIRE_PUBLISHED_THEME=1 to make that fatal (CI does), so a green tick never stands for "nobody looked".

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = '@kaitencloud/theme';
const REGISTRY = 'https://registry.npmjs.org';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = join(repoRoot, 'src', 'styles');

/** Drop comments so prose containing `--token: value` is never parsed as CSS. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every `--name: value` declaration, in source order.
 *
 * Values are compared as written apart from whitespace collapsing: `#fff` and
 * `#ffffff` are the same colour but not the same declaration, and a check that
 * normalised them would have to know which of the dozen CSS value syntaxes each
 * token uses. Comparing text keeps this honest at the cost of a false positive
 * nobody has hit yet — and a reformat-only diff still needs a release to reach
 * consumers, so flagging it is not wrong.
 */
function declarations(css) {
  const found = new Map();
  const pattern = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = pattern.exec(stripComments(css))) !== null) {
    found.set(`--${match[1]}`, match[2].trim().replace(/\s+/g, ' '));
  }
  return found;
}

/** The `:root { … }` or `.dark { … }` body of the published global.css. */
function block(css, selector) {
  const source = stripComments(css);
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return null;
  const end = source.indexOf('\n}', start);
  return end === -1 ? null : source.slice(start, end);
}

/**
 * Find the tarball published at `version` and unpack it. Resolves to one of:
 *
 *   { status: "published", dist }    the unpacked tarball's dist/ directory
 *   { status: "pending", latest }    the package exists, this version does not
 *   { status: "never-published" }
 *   { status: "unreachable", reason }
 *
 * `KAITEN_PUBLISHED_THEME_DIST` short-circuits the fetch with an already-extracted
 * dist, which keeps the comparison itself runnable offline.
 */
async function fetchPublished(version) {
  const handed = process.env.KAITEN_PUBLISHED_THEME_DIST;
  if (handed) {
    return existsSync(handed)
      ? { status: 'published', dist: handed }
      : {
          status: 'unreachable',
          reason: `KAITEN_PUBLISHED_THEME_DIST=${handed} does not exist`,
        };
  }

  try {
    // The abbreviated packument: each version's tarball URL and integrity, no more.
    const response = await fetch(`${REGISTRY}/${PACKAGE.replace('/', '%2f')}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) return { status: 'never-published' };
    if (!response.ok) {
      return {
        status: 'unreachable',
        reason: `the registry answered HTTP ${response.status}`,
      };
    }
    const packument = await response.json();
    if (Object.keys(packument.versions ?? {}).length === 0)
      return { status: 'never-published' };
    const release = packument.versions[version];
    if (!release)
      return { status: 'pending', latest: packument['dist-tags']?.latest };

    const download = await fetch(release.dist.tarball, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!download.ok) {
      return {
        status: 'unreachable',
        reason: `the tarball download answered HTTP ${download.status}`,
      };
    }
    const tarball = Buffer.from(await download.arrayBuffer());
    const integrity = release.dist.integrity ?? '';
    const separator = integrity.indexOf('-');
    const digest = createHash(integrity.slice(0, separator))
      .update(tarball)
      .digest('base64');
    if (separator === -1 || digest !== integrity.slice(separator + 1)) {
      return {
        status: 'unreachable',
        reason: `the tarball does not match its integrity ${integrity}`,
      };
    }

    const dir = mkdtempSync(join(tmpdir(), 'kaiten-theme-'));
    writeFileSync(join(dir, 'package.tgz'), tarball);
    execFileSync('tar', ['-xzf', join(dir, 'package.tgz'), '-C', dir]);
    const dist = join(dir, 'package', 'dist');
    return existsSync(dist)
      ? { status: 'published', dist }
      : { status: 'unreachable', reason: 'the tarball has no dist/ directory' };
  } catch (error) {
    return {
      status: 'unreachable',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Compare two declaration maps, enumerating names from BOTH sides. */
function diff(sourceDecls, publishedDecls) {
  const changed = [];
  const missing = [];
  const extra = [];

  for (const [name, value] of sourceDecls) {
    if (!publishedDecls.has(name)) missing.push({ name, value });
    else if (publishedDecls.get(name) !== value)
      changed.push({ name, value, published: publishedDecls.get(name) });
  }
  for (const [name, value] of publishedDecls) {
    if (!sourceDecls.has(name)) extra.push({ name, value });
  }

  return { changed, missing, extra };
}

const version = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8'),
).version;
const published = await fetchPublished(version);

if (published.status === 'pending') {
  console.log(
    `✓ ${PACKAGE}@${version} is not on npm yet (latest: ${published.latest ?? 'none'}). That is a\n` +
      `  pending release — release-theme.yml publishes every version the registry lacks — so\n` +
      `  there is no tarball to compare at ${version}.`,
  );
  process.exit(0);
}

if (published.status !== 'published') {
  const message =
    published.status === 'never-published'
      ? `${PACKAGE} has never been published on ${REGISTRY}`
      : `${PACKAGE}@${version} could not be fetched from ${REGISTRY}: ${published.reason}`;
  if (process.env.KAITEN_REQUIRE_PUBLISHED_THEME === '1') {
    console.error(
      `✗ ${message}.\n\n  KAITEN_REQUIRE_PUBLISHED_THEME=1: refusing to report success on a comparison that never ran.`,
    );
    process.exit(1);
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(
      `::warning title=Theme drift not checked::${message}. Nothing was compared.`,
    );
  }
  console.warn(`⚠ skipped: ${message}.`);
  console.warn(`  Nothing was compared. This is NOT a pass.`);
  if (published.status === 'never-published') {
    console.warn(`  Nothing can be compared until a first version is on npm.`);
  }
  process.exit(0);
}

const globalCss = readFileSync(join(published.dist, 'global.css'), 'utf8');
const scopes = [
  {
    label: 'light',
    source: declarations(
      readFileSync(join(stylesDir, 'tokens.partial.css'), 'utf8'),
    ),
    published: declarations(block(globalCss, ':root') ?? ''),
  },
  {
    label: 'dark',
    source: declarations(
      readFileSync(join(stylesDir, 'tokens.dark.partial.css'), 'utf8'),
    ),
    published: declarations(block(globalCss, '.dark') ?? ''),
  },
  {
    label: 'tailwind mapping',
    source: declarations(
      readFileSync(join(stylesDir, 'theme-inline.css'), 'utf8'),
    ),
    published: declarations(
      readFileSync(join(published.dist, 'theme-inline.css'), 'utf8'),
    ),
  },
];

const results = scopes.map((scope) => ({
  ...scope,
  ...diff(scope.source, scope.published),
}));
const drifted = results.filter(
  (r) => r.changed.length || r.missing.length || r.extra.length,
);
const total = drifted.reduce(
  (n, r) => n + r.changed.length + r.missing.length + r.extra.length,
  0,
);
const compared = scopes.reduce((n, s) => n + s.source.size, 0);

if (total === 0) {
  console.log(
    `✓ ${PACKAGE}@${version} source matches the published tarball (${compared} tokens)`,
  );
  process.exit(0);
}

const report = drifted
  .map((scope) => {
    const lines = [`  ${scope.label}`];
    for (const { name, value, published } of scope.changed)
      lines.push(
        `      ~ ${name}\n          source:    ${value}\n          published: ${published}`,
      );
    for (const { name, value } of scope.missing)
      lines.push(
        `      + ${name}: ${value}\n          absent from the published build — consumers get an unresolvable var()`,
      );
    for (const { name, value } of scope.extra)
      lines.push(
        `      - ${name}: ${value}\n          published but no longer in source`,
      );
    return lines.join('\n');
  })
  .join('\n\n');

console.error(
  `✗ ${total} token(s) differ from the published ${PACKAGE}@${version}, at the same\n` +
    `  version. As it stands these edits can never reach a consumer:\n` +
    `  consumers install the tarball from npm, not this source.\n\n${report}\n\n` +
    `  Fix: bump \`version\` in packages/theme/package.json and add a CHANGELOG.md entry.\n` +
    `  Under a zero major the minor\n` +
    `  segment carries a breaking change — a token whose value moves is breaking for\n` +
    `  anyone who matched the old one.\n` +
    `  If a token here is deliberately app-only, it does not belong in this package.`,
);
process.exit(1);
