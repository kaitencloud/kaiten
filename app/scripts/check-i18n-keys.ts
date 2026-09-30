/**
 * Fails when the code asks for a translation key that `en.ts` does not have.
 *
 * `check-i18n-parity` only compares `en` with `fr`. It cannot see a key that
 * is used in the code but lives in neither locale, and i18next hides that
 * gap: `t('Some.key', 'English default')` renders the inline default in every
 * language, and a call without a default renders the raw key. The French UI
 * then silently shows English. This check reads the sources instead of the
 * locales, so the gap fails at CI time.
 *
 * What it collects (parsed with oxc, never matched with regexes over text):
 *   - the first argument of `t(...)`, `i18n.t(...)` (any `<x>.t(...)`) and the
 *     local `tr(...)` wrappers, and the same inside a conditional
 *     (`t(a ? 'X.y' : 'X.z')`);
 *   - the `i18nKey="..."` prop of `<Trans>`;
 *   - key tables: any other string literal shaped like a full key under a
 *     top-level locale namespace (`'Pages.Customers.status.active'`), because
 *     the code often stores a key in a `labelKey`/`*_LABEL_KEYS` table and
 *     translates it later with `t(labelKey)`. Such a literal may also be a
 *     namespace prefix (`'Pages.Integrations.ServiceAccounts.NewToken'`) that
 *     the code extends at runtime, so it passes when it names an object.
 *
 * What it cannot check, and only counts: keys built at runtime (`t(key)`,
 * `` t(`Pages.${x}.title`) ``, `t(TABLE[x])`). The table entries behind
 * `t(TABLE[x])` are still checked as key tables above.
 *
 * Not scanned: the locale files themselves, generated code (`api-client/`,
 * `*.gen.ts`), unit tests and stories. A test or a story stubs `t` with its own
 * message table (`{ 'Common.next': 'Next' }`) whose keys are the ones the code
 * asks for, so scanning them would only repeat the code's findings, and their
 * fixtures may use made-up keys on purpose.
 *
 * Plural forms (`key_one`, `key_other`, ...) count as the key being present,
 * and so do context forms (`key_<context>`) for a call that passes `context`,
 * as i18next resolves them.
 *
 * Run with: `pnpm check:i18n-keys` (tsx scripts/check-i18n-keys.ts)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync, Visitor } from 'oxc-parser';
import type { Expression, Node } from 'oxc-parser';
import en from '../src/lib/i18n/locales/en';

export type LocaleTree = Record<string, unknown>;

export type KeyUsage = {
  /** The key as written in the source. */
  key: string;
  file: string;
  line: number;
  /** `call` is a direct translation call, `table` a stored key literal. */
  kind: 'call' | 'i18nKey' | 'table';
  /** The English default the call passes inline, when it has one. */
  defaultValue?: string;
  /** The call passes a `context` option, so `key_<context>` answers it. */
  hasContext?: boolean;
};

export type Extraction = {
  usages: KeyUsage[];
  /** Translation calls whose key is not a string known at parse time. */
  dynamicCount: number;
};

/** Callee names of translation helpers, besides any `<x>.t(...)` member call. */
const TRANSLATE_CALLEES = new Set(['t', 'tr']);
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const KEY_SEGMENT = '[A-Za-z0-9_-]+';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_PATHS: RegExp[] = [
  /^lib\/i18n\/locales\//,
  /^api-client\//,
  /\.gen\.ts$/,
  /\.test\.(ts|tsx)$/,
  /(^|\/)__tests__\//,
  /\.stories\.(ts|tsx)$/,
  /(^|\/)stories\//,
];

export function isExcluded(relativePath: string): boolean {
  const normalized = relativePath.split(sep).join('/');
  return EXCLUDED_PATHS.some((pattern) => pattern.test(normalized));
}

function lineOf(content: string, position: number): number {
  return content.slice(0, position).split('\n').length;
}

/** Strips parentheses and TypeScript wrappers (`x as const`, `x!`, `<T>x`). */
function unwrap(node: Node): Node {
  let current = node;
  for (;;) {
    switch (current.type) {
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
        current = current.expression;
        break;
      default:
        return current;
    }
  }
}

function staticString(node: Node): string | null {
  const inner = unwrap(node);
  if (inner.type === 'Literal' && typeof inner.value === 'string') {
    return inner.value;
  }
  if (
    inner.type === 'TemplateLiteral' &&
    inner.expressions.length === 0 &&
    inner.quasis.length === 1
  ) {
    return inner.quasis[0].value.cooked ?? null;
  }
  return null;
}

type KeyCandidate = { key: string; start: number; node: Node };

/**
 * The keys a key expression can evaluate to. A conditional or a logical
 * expression contributes each branch; whatever is not a string known at parse
 * time is counted in `dynamic`. An empty string is "no key", not a key.
 */
function collectKeyCandidates(
  expression: Node,
  out: KeyCandidate[],
  counters: { dynamic: number },
) {
  const node = unwrap(expression);
  if (node.type === 'ConditionalExpression') {
    collectKeyCandidates(node.consequent, out, counters);
    collectKeyCandidates(node.alternate, out, counters);
    return;
  }
  if (node.type === 'LogicalExpression') {
    collectKeyCandidates(node.left, out, counters);
    collectKeyCandidates(node.right, out, counters);
    return;
  }
  const value = staticString(node);
  if (value === null) {
    counters.dynamic++;
  } else if (value !== '') {
    out.push({ key: value, start: node.start, node });
  }
}

/** The options object of a call: `t('key', { count })`, `t('key', 'default', { count })`. */
function optionsOf(args: readonly Node[]): Node | undefined {
  return args
    .slice(1)
    .map(unwrap)
    .find((arg) => arg.type === 'ObjectExpression');
}

function optionValue(
  options: Node | undefined,
  name: string,
): Node | undefined {
  if (options?.type !== 'ObjectExpression') return undefined;
  for (const property of options.properties) {
    if (
      property.type === 'Property' &&
      !property.computed &&
      ((property.key.type === 'Identifier' && property.key.name === name) ||
        (property.key.type === 'Literal' && property.key.value === name))
    ) {
      return property.value;
    }
  }
  return undefined;
}

/** `t('key', 'default')` or `t('key', { defaultValue: 'default' })`. */
function inlineDefault(args: readonly Node[]): string | undefined {
  const second = args[1] && unwrap(args[1]);
  if (!second) return undefined;
  const literal = staticString(second);
  if (literal !== null) return literal;
  const value = optionValue(optionsOf(args), 'defaultValue');
  return value && (staticString(value) ?? undefined);
}

function isTranslateCallee(callee: Expression): boolean {
  const node = unwrap(callee);
  if (node.type === 'Identifier') return TRANSLATE_CALLEES.has(node.name);
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 't'
  );
}

function getParserLang(filePath: string): 'ts' | 'tsx' {
  return filePath.endsWith('.tsx') ? 'tsx' : 'ts';
}

/**
 * Collects every translation key one source file uses. `rootNamespaces` are
 * the top-level locale keys (`Common`, `Pages`, ...) that a stored key literal
 * must start with to be taken for a key.
 */
export function extractTranslationKeys(
  filePath: string,
  content: string,
  rootNamespaces: readonly string[],
): Extraction {
  const { program, errors } = parseSync(filePath, content, {
    lang: getParserLang(filePath),
  });
  if (errors.length > 0) {
    throw new Error(`${filePath}: ${errors[0].message}`);
  }

  const tableKeyShape = new RegExp(
    `^(?:${rootNamespaces.join('|')})(?:\\.${KEY_SEGMENT})+$`,
  );
  const usages: KeyUsage[] = [];
  const counters = { dynamic: 0 };
  const claimed = new Set<number>();

  const add = (
    candidate: KeyCandidate,
    kind: KeyUsage['kind'],
    extra: Pick<KeyUsage, 'defaultValue' | 'hasContext'> = {},
  ) => {
    claimed.add(candidate.start);
    usages.push({
      key: candidate.key,
      file: filePath,
      line: lineOf(content, candidate.start),
      kind,
      ...extra,
    });
  };

  const tableCandidates: KeyCandidate[] = [];
  const visitLiteral = (node: Node) => {
    const value = staticString(node);
    if (value !== null && tableKeyShape.test(value)) {
      tableCandidates.push({ key: value, start: node.start, node });
    }
  };

  new Visitor({
    CallExpression(node) {
      if (!isTranslateCallee(node.callee) || node.arguments.length === 0) {
        return;
      }
      const [first] = node.arguments;
      if (first.type === 'SpreadElement') {
        counters.dynamic++;
        return;
      }
      const candidates: KeyCandidate[] = [];
      collectKeyCandidates(first, candidates, counters);
      const extra = {
        defaultValue: inlineDefault(node.arguments),
        hasContext:
          optionValue(optionsOf(node.arguments), 'context') !== undefined,
      };
      for (const candidate of candidates) {
        add(candidate, 'call', extra);
      }
    },
    JSXAttribute(node) {
      if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'i18nKey') {
        return;
      }
      const value = node.value;
      if (!value) return;
      const expression =
        value.type === 'JSXExpressionContainer' ? value.expression : value;
      if (expression.type === 'JSXEmptyExpression') return;
      const candidates: KeyCandidate[] = [];
      collectKeyCandidates(expression, candidates, counters);
      for (const candidate of candidates) {
        add(candidate, 'i18nKey');
      }
    },
    Literal: visitLiteral,
    TemplateLiteral: visitLiteral,
  }).visit(program);

  // A literal already read as a call argument is not a second usage.
  for (const candidate of tableCandidates) {
    if (!claimed.has(candidate.start)) {
      add(candidate, 'table');
    }
  }

  usages.sort((a, b) => a.line - b.line);
  return { usages, dynamicCount: counters.dynamic };
}

function lookup(tree: LocaleTree, key: string): unknown {
  let current: unknown = tree;
  for (const segment of key.split('.')) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, segment)
    ) {
      return undefined;
    }
    current = (current as LocaleTree)[segment];
  }
  return current;
}

/**
 * Whether `tree` can answer `key`: a string at that path, or a plural form of
 * it (`key_one`, `key_other`, ...), or with `allowContext` any `key_<context>`
 * form. A namespace (an object) is only an answer with `allowNamespace`, for a
 * stored key literal the code extends at runtime.
 */
export function hasTranslation(
  tree: LocaleTree,
  key: string,
  {
    allowNamespace = false,
    allowContext = false,
  }: { allowNamespace?: boolean; allowContext?: boolean } = {},
): boolean {
  const exact = lookup(tree, key);
  if (typeof exact === 'string') return true;
  if (exact !== null && typeof exact === 'object') return allowNamespace;

  const separator = key.lastIndexOf('.');
  const parent =
    separator === -1 ? tree : lookup(tree, key.slice(0, separator));
  if (parent === null || typeof parent !== 'object') return false;
  const leaf = key.slice(separator + 1);
  return Object.entries(parent).some(
    ([name, value]) =>
      typeof value === 'string' &&
      name.startsWith(`${leaf}_`) &&
      (allowContext || PLURAL_SUFFIXES.includes(name.slice(leaf.length + 1))),
  );
}

export function findMissingKeys(
  tree: LocaleTree,
  usages: readonly KeyUsage[],
): KeyUsage[] {
  return usages.filter(
    (usage) =>
      !hasTranslation(tree, usage.key, {
        allowNamespace: usage.kind === 'table',
        allowContext: usage.hasContext,
      }),
  );
}

function collectSourceFiles(srcDir: string, directory = srcDir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        files.push(...collectSourceFiles(srcDir, entryPath));
      }
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(extname(entry.name)) &&
      !entry.name.endsWith('.d.ts') &&
      !isExcluded(relative(srcDir, entryPath))
    ) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function runCli() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const srcDir = resolve(appDir, 'src');
  const rootNamespaces = Object.keys(en);

  const usages: KeyUsage[] = [];
  let dynamicCount = 0;
  const files = collectSourceFiles(srcDir);
  for (const filePath of files) {
    const extraction = extractTranslationKeys(
      filePath,
      readFileSync(filePath, 'utf8'),
      rootNamespaces,
    );
    usages.push(...extraction.usages);
    dynamicCount += extraction.dynamicCount;
  }

  const missing = findMissingKeys(en as LocaleTree, usages);
  const distinct = new Set(usages.map((usage) => usage.key)).size;

  if (missing.length > 0) {
    console.error(
      `[i18n-keys] ${missing.length} use(s) of a key that is absent from "en":`,
    );
    for (const usage of missing) {
      const hint =
        usage.defaultValue === undefined
          ? ''
          : ` (default: ${JSON.stringify(usage.defaultValue)})`;
      console.error(
        `  - ${usage.key}  ${relative(appDir, usage.file)}:${usage.line}${hint}`,
      );
    }
    console.error(
      `\nAdd each key to src/lib/i18n/locales/en.ts and fr.ts. Until then the UI shows the inline default, or the raw key, in every language.`,
    );
    console.error(
      `[i18n-keys] ${dynamicCount} dynamic key(s) skipped (not statically known).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[i18n-keys] All ${distinct} static keys used in ${files.length} source files exist in "en" (${dynamicCount} dynamic key(s) skipped).`,
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  runCli();
}
