import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseSync, Visitor } from 'oxc-parser';

// Compare rule ASTs, not formatting. Source roots and ignored scopes intentionally differ.
export function lintRulesSignature(source: string): unknown[] {
  const { program } = parseSync('vite.config.ts', source);
  const selected: unknown[] = [];
  new Visitor({
    VariableDeclarator(node) {
      if (node.id.type === 'Identifier' && ['headlessUiImports', 'routeMutationImport', 'routeUiStateImport'].includes(node.id.name)) {
        selected.push(node.init);
      }
    },
    Property(node) {
      if (node.key.type === 'Identifier' && node.key.name === 'lint' && node.value.type === 'ObjectExpression') {
        selected.push({ ...node.value, properties: node.value.properties.filter(property =>
          !(property.type === 'Property' && property.key.type === 'Identifier' && property.key.name === 'ignorePatterns')) });
      }
    },
  }).visit(program);
  const canonical = (value: unknown): unknown => {
    if (typeof value === 'string') return value.replaceAll('app/src/', 'src/');
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) =>
      !['start', 'end', 'raw', 'loc', 'range'].includes(key)).map(([key, item]) => [key, canonical(item)]));
    return value;
  };
  return selected.map(canonical);
}

export function checkLintParity() {
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const rootRules = lintRulesSignature(readFileSync(resolve(app, '../vite.config.ts'), 'utf8'));
  const appRules = lintRulesSignature(readFileSync(resolve(app, 'vite.config.ts'), 'utf8'));
  if (rootRules.length !== 4 || !isDeepStrictEqual(rootRules, appRules)) {
    throw new Error('Root/app lint rules differ. Keep rule settings identical; only source scopes may differ.');
  }
  console.log('[lint-parity] Root/app rules match; source scopes remain explicit.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkLintParity();
