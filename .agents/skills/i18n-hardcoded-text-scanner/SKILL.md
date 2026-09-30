---
name: i18n-hardcoded-text-scanner
description: Find and replace hardcoded user-facing strings with i18n keys following project naming conventions. Use when building UI, reviewing PRs, or refactoring localization coverage.
---

# I18n Hardcoded Text Scanner

Replace hardcoded visible text with structured translation keys.

## Workflow

1. Read i18n conventions:
   - `app/docs/02-conventions/i18n.md`
   - `app/docs/glossary.md`
2. Scan changed UI code for hardcoded strings in:
   - JSX text nodes, button labels, table headers, dialog titles/descriptions, toasts.
3. Determine target key namespace:
   - `Common.*`, `Functionals.*`, `Errors.*`, `Pages.<Feature>.*`, `Features.<Feature>.*`.
4. Add each missing key to both locale files, with the same key path:
   - `app/src/lib/i18n/locales/en.ts` first (the reference locale);
   - `app/src/lib/i18n/locales/fr.ts` (French, registered next to English in
     `app/src/lib/i18n/config.ts`); the two files must stay in step: the parity
     check below fails on any key present in one file and absent from the other.
5. Replace UI text with `t(...)` calls and keep key structure predictable.
6. Validate that no newly introduced visible string remains hardcoded, then
   run the two locale checks from `app/`: parity between `en.ts` and `fr.ts`, and
   every key the code uses present in `en.ts` (a key known only by its inline
   default shows English in the French UI):

   ```bash
   pnpm run check:i18n-parity
   pnpm run check:i18n-keys
   ```

   API error codes have their own translations (`Errors.api.<CODE>` in both
   files); `pnpm run check:api-error-i18n` covers them.

## Useful commands

```bash
rg -n ">[^<{][^<]*<|title:\s*'|title:\s*\"|toast\.(success|error)\('" app/src
rg -n "t\('" app/src/features app/src/functionals app/src/components
cd app && pnpm run check:i18n-parity && pnpm run check:i18n-keys
```

## Output

- List new keys added (en and fr) and where they are used.
- List remaining hardcoded text with file paths.
- Provide naming corrections for nonconforming keys.
