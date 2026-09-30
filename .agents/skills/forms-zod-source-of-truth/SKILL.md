---
name: forms-zod-source-of-truth
description: Implement and review frontend forms with TanStack Form using generated OpenAPI Zod schemas as source of truth. Use when adding or editing forms, form schemas, or form submission logic.
---

# Forms Zod Source of Truth

Build forms from generated schemas and keep validation synchronized with API contracts.

## Workflow

1. Read form and API generation references:
   - `app/docs/03-patterns/forms.md`
   - `app/docs/01-architecture/api-generation.md`
   - `app/docs/02-conventions/error-handling.md`
2. Locate generated schema in `app/src/api-client/zod.gen.ts`.
3. Build form schema by composing generated schema:
   - Prefer `.pick()`, `.extend()`, `.refine()` over manual full redefinition.
4. Use `useAppForm` and place form logic in feature hooks when complex.
5. Handle submit with mutation + error handling:
   - `try/catch` in `onSubmit` for form flows.
   - Keep mutation invalidation in mutation callbacks.
6. Ensure all labels, placeholders, descriptions, and messages are translated via i18n keys.

## Useful commands

```bash
rg -n "z\\.object\\(" app/src/features
rg -n "useAppForm|validators:" app/src/features
rg -n "mutateAsync\\(|onSubmit:" app/src/features
```

## Output

- Report schema alignment status (generated vs manual).
- Provide exact refactors for schema composition and submit flow.
- List missing i18n keys in form UI.
