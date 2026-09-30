import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STYLES_DIR = path.resolve('src/styles');

/**
 * Namespace applied to every token in the `.kaiten`-scoped build.
 *
 * The SDK renders inside someone else's page, so its tokens carry a prefix the host
 * cannot collide with — and that prefix is also the SDK's public override contract:
 * `appearance.variables` writes exactly these names. The values behind it are the
 * ones the host build uses; only the names differ.
 *
 * Generating both builds from one partial is what stops them drifting. They did
 * drift: `--destructive` was corrected for contrast on one side only, so the
 * accessible value never reached the components that render it.
 */
const SCOPED_PREFIX = 'ktn-';

function indentBlock(content: string): string {
  return content
    .split('\n')
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join('\n')
    .replace(/^\s+$/gm, '')
    .replace(/\n+$/, '');
}

/**
 * Rename every declaration in a token partial: `--radius:` becomes `--ktn-radius:`.
 *
 * Only declaration heads are rewritten. The partials deliberately hold plain
 * literals with no `var()` cross-references, so nothing inside a value needs
 * touching and prose in comments is left as written.
 */
function prefixDeclarations(partial: string): string {
  return partial.replace(
    /^(\s*)--([a-z0-9-]+)(\s*:)/gim,
    `$1--${SCOPED_PREFIX}$2$3`,
  );
}

/**
 * Make every scoped token overridable per colour mode.
 *
 * `--ktn-background: #ffffff` becomes
 * `--ktn-background: var(--ktn-light-background, #ffffff)`, and the dark block
 * reads `--ktn-dark-background`. The SDK provider then writes BOTH namespaces
 * as plain inline custom properties and the cascade picks the one that belongs
 * to the active mode.
 *
 * The alternative was for the provider to emit a stylesheet, because an inline
 * style has no selector and no media query: one set of values overrides the
 * light rule and the dark rule alike, which is why a per-mode palette was
 * impossible before. Indirecting through a second namespace keeps the override
 * inline — so it survives SSR with no hydration flash, needs no CSP nonce, no
 * de-duplication across providers, and nested style roots inherit it for free.
 *
 * Every token gets the treatment, not just the thirty the public API exposes
 * today: the partials *are* the token set, and a key added there should become
 * overridable without anyone remembering to touch this file.
 */
function modeScopeDeclarations(
  partial: string,
  mode: 'light' | 'dark',
): string {
  return partial.replace(
    /^(\s*)--([a-z0-9-]+)(\s*:\s*)([^;]+);/gim,
    (_match, indent: string, name: string, separator: string, value: string) =>
      `${indent}--${name}${separator}var(--${SCOPED_PREFIX}${mode}-${name.slice(SCOPED_PREFIX.length)}, ${value.trim()});`,
  );
}

/**
 * Point the shared Tailwind mapping at the prefixed tokens.
 *
 * Tailwind's theme keys stay generic (`--color-primary`), so components keep using
 * `bg-primary` and no component changes when the namespace does — only the variable
 * each key reads is renamed. Deriving this from the hand-written mapping instead of
 * keeping a second copy means a token added there reaches both builds at once.
 */
function scopeInlineMapping(inline: string): string {
  return inline.replace(/var\(--([a-z0-9-]+)\)/gi, `var(--${SCOPED_PREFIX}$1)`);
}

/**
 * A comment, or a quoted string that has to survive untouched.
 *
 * Strings are matched first so that a `/*` inside a quoted value is never taken for
 * the start of a comment.
 */
const COMMENT_OR_STRING =
  /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\//g;

/** Stands in for a removed comment until the lines around it are tidied up. */
const REMOVED_COMMENT = String.fromCharCode(0);

/**
 * Remove every comment from a stylesheet bound for `dist/`.
 *
 * The partials explain their values at length, and that prose is internal: the
 * package is published on the public registry, so none of it may ship. Only the
 * comments go. Every declaration keeps its exact text, which
 * scripts/check-stripped-css.mjs verifies against the unstripped output.
 *
 * A line that held nothing but a comment goes with it, and the blank lines that
 * leaves collapse: never two in a row, none just inside a brace. A blank line the
 * source put between two groups of declarations stays.
 */
function stripComments(css: string): string {
  const lines: string[] = [];
  const marked = css.replace(
    COMMENT_OR_STRING,
    (_match: string, quoted: string | undefined) => quoted ?? REMOVED_COMMENT,
  );
  for (const line of marked.split('\n')) {
    const text = line.replaceAll(REMOVED_COMMENT, '').trimEnd();
    const previous = lines.at(-1);
    if (text === '') {
      if (line.includes(REMOVED_COMMENT)) continue;
      if (previous === undefined || previous === '' || previous.endsWith('{'))
        continue;
    } else if (text.trimStart().startsWith('}') && previous === '') {
      lines.pop();
    }
    lines.push(text);
  }
  return lines.join('\n');
}

async function readStyle(filename: string): Promise<string> {
  const raw = await readFile(path.join(STYLES_DIR, filename), 'utf8');
  return raw.trim();
}

/** The four stylesheets the package ships, by their file name in `dist/`. */
export type ThemeCssFile =
  | 'global.css'
  | 'scoped.css'
  | 'theme-inline.css'
  | 'theme-inline-scoped.css';

/**
 * Render the four stylesheets from the partials, comments still in.
 *
 * The build never writes this output as it is: `generateThemeCss` strips it first.
 * scripts/check-stripped-css.mjs renders it again to prove that the stripping
 * removed comments and nothing else.
 */
export async function renderThemeCss(): Promise<Record<ThemeCssFile, string>> {
  const [light, dark, inline] = await Promise.all([
    readStyle('tokens.partial.css'),
    readStyle('tokens.dark.partial.css'),
    readStyle('theme-inline.css'),
  ]);

  // Host apps own the generic names, on their own root.
  const global = [
    ':root {',
    indentBlock(light),
    '}',
    '',
    '.dark {',
    indentBlock(dark),
    '}',
    '',
  ].join('\n');

  // The SDK gets the same values under its namespace, scoped so nothing leaks into
  // the host page — or in from it, and per-mode overridable (see
  // `modeScopeDeclarations`).
  //
  // `.dark .kaiten` is the inherit-from-the-host branch: an embedded widget
  // follows the page it lives in when the integrator says nothing. `:not(.ktn-light)`
  // is what lets them say something — an explicit `baseTheme: "light"` used to be
  // unenforceable inside a dark host, because an inheritance heuristic outranked
  // the declaration. The provider stamps `ktn-light` only when the mode was chosen.
  const scoped = [
    '.kaiten {',
    indentBlock(modeScopeDeclarations(prefixDeclarations(light), 'light')),
    '}',
    '',
    '.kaiten.dark,',
    '.dark .kaiten:not(.ktn-light) {',
    indentBlock(modeScopeDeclarations(prefixDeclarations(dark), 'dark')),
    '}',
    '',
  ].join('\n');

  return {
    'global.css': global,
    'scoped.css': scoped,
    'theme-inline.css': `${inline}\n`,
    'theme-inline-scoped.css': `${scopeInlineMapping(inline)}\n`,
  };
}

/** Write the four stylesheets to `outDir`, with every comment removed. */
export async function generateThemeCss(outDir: string): Promise<void> {
  const files = await renderThemeCss();
  await mkdir(outDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([file, css]) =>
      writeFile(path.join(outDir, file), stripComments(css), 'utf8'),
    ),
  );
}
