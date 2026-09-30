/**
 * Fails when an API error code has no user-facing translation.
 *
 * Every `AppErrorCode` (the codes `handleApiError` produces) must have an
 * `Errors.api.<code>` entry in the locale tree, otherwise the error toast falls
 * back to a hardcoded English string regardless of the active language. en/fr
 * parity is enforced separately by `check-i18n-parity`, so checking the `en`
 * reference here is enough.
 *
 * Run with: `pnpm check:api-error-i18n` (tsx scripts/check-api-error-i18n.ts)
 */
import { API_ERROR_CODES } from '../src/lib/errors/types';
import en from '../src/lib/i18n/locales/en';

const NS = 'Errors.api';

const apiErrors =
  (
    (en as Record<string, unknown>).Errors as
      | Record<string, unknown>
      | undefined
  )?.api ?? {};
const present = new Set(Object.keys(apiErrors as Record<string, unknown>));

const codes = API_ERROR_CODES as readonly string[];
const missing = codes.filter((code) => !present.has(code));
const extra = [...present].filter((key) => !codes.includes(key));

let failed = false;

if (missing.length > 0) {
  failed = true;
  console.error(
    `[api-error-i18n] ${missing.length} AppErrorCode(s) without an "${NS}.*" translation:`,
  );
  for (const code of missing) {
    console.error(`  - ${NS}.${code}`);
  }
}

if (extra.length > 0) {
  failed = true;
  console.error(
    `[api-error-i18n] ${extra.length} "${NS}.*" key(s) that are not in AppErrorCode (stale):`,
  );
  for (const key of extra) {
    console.error(`  - ${NS}.${key}`);
  }
}

if (failed) {
  console.error(
    `\nAdd/remove keys under "${NS}" in src/lib/i18n/locales/{en,fr}.ts so they match AppErrorCode (src/lib/errors/types.ts).`,
  );
  process.exit(1);
}

console.log(
  `[api-error-i18n] OK — all ${codes.length} AppErrorCodes have an "${NS}.*" translation.`,
);
