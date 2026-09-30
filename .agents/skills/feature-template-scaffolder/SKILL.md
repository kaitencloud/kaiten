---
name: feature-template-scaffolder
description: Scaffold and align new or refactored frontend features with the project feature template. Use when creating a feature folder, splitting a large feature, or standardizing exports and file structure.
---

# Feature Template Scaffolder

Create or refactor feature modules to match project structure and export rules.

## Workflow

1. Read feature structure references:
   - `app/docs/04-features/_template/FEATURE_TEMPLATE.md`
   - `app/docs/01-architecture/folder-structure.md`
   - `app/docs/02-conventions/code-style.md`
2. Create or normalize feature folders. `components/`, `index.ts` and `README.md`
   are always present; add `hooks/`, `types/`, `queries/`, `schemas/`, `store/` and
   `utils/` only when the feature needs them (`audit-trail` has none of them).
3. Build barrel exports:
   - Add explicit exports in each subfolder `index.ts` that is a real module boundary.
   - Keep feature root `index.ts` reserved for route-level API only.
4. Enforce import boundaries (`pnpm run check:architecture` checks them):
   - Route files import from `@/features/<name>`.
   - Code inside the feature imports its own files with relative paths, never
     through `@/features/<name>` (root barrel: error) nor `@/features/<name>/...` (warning).
   - A feature never imports another feature, not even a type. Shared business
     code moves to `domains/<name>/` at the second independent consumer.
5. For large detail pages, split hooks into:
   - `*-detail-data`, `*-detail-mutations`, `*-detail-derived-state`, and one assembler hook.
6. Add or update the feature's `README.md` in `app/src/features/<feature>/`
   when its structure changes materially: it is the single home of the
   feature's documentation.

## Useful commands

```bash
rg --files app/src/features/<feature>
rg -n '^export \* from' app/src/features/<feature>
rg -n "from '@/features/<feature>'" app/src --glob '!app/src/routes/**' --glob '!*.md'
cd app && pnpm run check:architecture
```

## Output

- Return created tree and changed exports.
- Call out any remaining structure drift.
- Recommend targeted tests/stories for new modules.
