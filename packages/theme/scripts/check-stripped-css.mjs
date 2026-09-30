#!/usr/bin/env node
// Builds the package, then proves that the stylesheets in dist/ are the
// generator's output minus its comments, and nothing else.
//
// scripts/generate-css.ts strips every comment from the four stylesheets it
// writes: the token partials carry internal design notes, and this package is
// published on the public npm registry. Removing text from a stylesheet is only
// safe if nothing else goes with it, so this asserts:
//
//   - no `/*` is left in any dist/*.css;
//   - each of the four files holds the same selector blocks as the unstripped
//     output of renderThemeCss(), in the same order, and every block holds the
//     same `--name: value` declarations, in the same order, with the same values.
//
// Both sides are read by the parser below rather than by the generator's own
// stripping, so a bug in the stripping shows up as a difference instead of being
// repeated on both sides of the comparison.
//
// Plain Node, no dependency: generate-css.ts is imported through Node's built-in
// type stripping, which is why this needs Node 24 (see .node-version).

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

// generate-css.ts reads src/styles relative to the working directory, the way
// `vp pack` runs it from the package root.
process.chdir(root);
execFileSync('pnpm', ['run', 'build'], { stdio: 'inherit' });

const { renderThemeCss } = await import('./generate-css.ts');
const unstripped = await renderThemeCss();

/** Collapse whitespace, so that line breaks and indentation never count as a change. */
function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Read a flat stylesheet (selector blocks holding declarations, no nesting) into
 * `{ blocks: [{ selector, declarations: [[name, value], …] }], comments }`.
 *
 * One pass over the text: a comment is skipped and counted, a quoted string is
 * copied as it is, so neither a `;` nor a `/*` inside one is read as syntax.
 */
function parse(css, label) {
  const fail = (message) => {
    throw new Error(`${label}: ${message}`);
  };
  const blocks = [];
  let comments = 0;
  let block = null;
  let buffer = '';

  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) fail('unterminated comment');
      comments += 1;
      buffer += ' ';
      i = end + 1;
    } else if (char === '"' || char === "'") {
      let end = i + 1;
      while (end < css.length && css[end] !== char)
        end += css[end] === '\\' ? 2 : 1;
      if (end >= css.length) fail('unterminated string');
      buffer += css.slice(i, end + 1);
      i = end;
    } else if (char === '{') {
      if (block) fail('nested block');
      block = { selector: normalize(buffer), declarations: [] };
      buffer = '';
    } else if (char === ';' || char === '}') {
      if (!block) fail(`"${char}" outside a block`);
      const declaration = normalize(buffer);
      if (declaration !== '') {
        const colon = declaration.indexOf(':');
        if (colon === -1) fail(`not a declaration: ${declaration}`);
        block.declarations.push([
          declaration.slice(0, colon).trim(),
          declaration.slice(colon + 1).trim(),
        ]);
      }
      buffer = '';
      if (char === '}') {
        blocks.push(block);
        block = null;
      }
    } else {
      buffer += char;
    }
  }
  if (block) fail('unterminated block');
  if (normalize(buffer) !== '')
    fail(`text outside a block: ${normalize(buffer)}`);
  return { blocks, comments };
}

const expectedFiles = Object.keys(unstripped).sort();
const builtFiles = readdirSync(distDir)
  .filter((file) => file.endsWith('.css'))
  .sort();
const problems = [];

if (builtFiles.join() !== expectedFiles.join()) {
  problems.push(
    `dist/ holds ${builtFiles.join(', ') || 'no CSS'}; the generator renders ${expectedFiles.join(', ')}`,
  );
}

for (const file of builtFiles) {
  if (readFileSync(join(distDir, file), 'utf8').includes('/*')) {
    problems.push(`dist/${file} still contains "/*"`);
  }
}

for (const file of expectedFiles.filter((name) => builtFiles.includes(name))) {
  const label = `dist/${file}`;
  const reported = problems.length;
  const want = parse(unstripped[file], `${file} (unstripped)`);
  const got = parse(readFileSync(join(distDir, file), 'utf8'), label);
  const declarations = want.blocks.reduce(
    (sum, block) => sum + block.declarations.length,
    0,
  );

  if (declarations === 0)
    problems.push(`the generator rendered no declaration for ${file}`);
  if (got.blocks.length !== want.blocks.length) {
    problems.push(
      `${label} has ${got.blocks.length} block(s), the unstripped output ${want.blocks.length}`,
    );
  }
  want.blocks.forEach((expected, index) => {
    const actual = got.blocks[index];
    if (!actual) return;
    if (actual.selector !== expected.selector) {
      problems.push(
        `${label} block ${index + 1} is "${actual.selector}", expected "${expected.selector}"`,
      );
      return;
    }
    const length = Math.max(
      expected.declarations.length,
      actual.declarations.length,
    );
    for (let d = 0; d < length; d += 1) {
      const [wantName, wantValue] = expected.declarations[d] ?? [];
      const [gotName, gotValue] = actual.declarations[d] ?? [];
      if (gotName !== wantName || gotValue !== wantValue) {
        problems.push(
          `${label} "${expected.selector}", declaration ${d + 1}:\n` +
            `      built:      ${gotName === undefined ? '(missing)' : `${gotName}: ${gotValue}`}\n` +
            `      unstripped: ${wantName === undefined ? '(none)' : `${wantName}: ${wantValue}`}`,
        );
        // One report per block: every declaration after a shift would differ too.
        break;
      }
    }
  });

  if (problems.length === reported) {
    console.log(
      `✓ ${label}: ${declarations} declarations in ${want.blocks.length} block(s) identical, ` +
        `${want.comments} comment(s) removed`,
    );
  }
}

if (problems.length > 0) {
  console.error(
    `✗ The built CSS is not the generator's output minus its comments:\n\n  ${problems.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(
  '✓ No comment ships in dist/*.css, and every declaration matches the unstripped output',
);
