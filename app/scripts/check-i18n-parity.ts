/**
 * Fails when the locale key trees diverge: every key present in `en` (the
 * reference locale) must exist in every other locale, and vice versa.
 * Runtime falls back to English silently, so missing keys only show up as a
 * mixed-language UI — this check surfaces them at CI time instead.
 *
 * Run with: `pnpm check:i18n-parity` (tsx scripts/check-i18n-parity.ts)
 */
import en from '../src/lib/i18n/locales/en';
import fr from '../src/lib/i18n/locales/fr';

type LocaleTree = Record<string, unknown>;

const REFERENCE = { name: 'en', tree: en as LocaleTree };
const LOCALES = [{ name: 'fr', tree: fr as LocaleTree }];

function flattenKeys(tree: LocaleTree, prefix = '', out: string[] = []) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      flattenKeys(value as LocaleTree, path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

function diff(a: string[], b: Set<string>): string[] {
  return a.filter((key) => !b.has(key));
}

const referenceKeys = flattenKeys(REFERENCE.tree);
const referenceSet = new Set(referenceKeys);
let failed = false;

for (const locale of LOCALES) {
  const localeKeys = flattenKeys(locale.tree);
  const localeSet = new Set(localeKeys);

  const missing = diff(referenceKeys, localeSet);
  const extra = diff(localeKeys, referenceSet);

  if (missing.length > 0) {
    failed = true;
    console.error(
      `[i18n] ${missing.length} key(s) missing in "${locale.name}" (present in "${REFERENCE.name}"):`,
    );
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
  }

  if (extra.length > 0) {
    failed = true;
    console.error(
      `[i18n] ${extra.length} key(s) present in "${locale.name}" but absent from "${REFERENCE.name}":`,
    );
    for (const key of extra) {
      console.error(`  - ${key}`);
    }
  }

  if (missing.length === 0 && extra.length === 0) {
    console.log(
      `[i18n] "${locale.name}" is in sync with "${REFERENCE.name}" (${referenceKeys.length} keys).`,
    );
  }
}

if (failed) {
  process.exit(1);
}
