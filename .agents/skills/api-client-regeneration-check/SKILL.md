---
name: api-client-regeneration-check
description: Verify OpenAPI and GraphQL generated client consistency and regeneration workflow. Use when backend contracts change or generated frontend types diverge.
---

# API Client Regeneration Check

Keep generated API client artifacts synchronized with backend contracts.

## Workflow

1. Read generation references:
   - `app/docs/01-architecture/api-generation.md`
   - `app/docs/01-architecture/overview.md`
2. Detect contract-impacting changes:
   - backend OpenAPI or GraphQL schema updates
   - frontend compile errors in generated type consumers
3. Run the regeneration sequence:
   - from the repository root, `task generate:oas` when the Go API changed: it
     rewrites `app/openapi.yaml` and `app/platform-openapi.yaml` from the Go
     source;
   - then `pnpm run generate` in `app/` (OpenAPI SDK, then GraphQL types).
     `task generate` at the root runs both steps. Always run the full
     `generate`: `generate-api-sdk` alone rewrites `src/api-client` and deletes
     the GraphQL types under `src/api-client/graphql`.
4. Verify generated outputs are not manually edited (`app/src/api-client/**`,
   `app/src/lib/api/scopes.gen.ts`, `app/openapi.yaml`).
5. Update feature schemas/forms that extend generated Zod contracts.
6. Report contract deltas and required follow-up refactors.

## Useful commands

```bash
# from the repository root
task generate:oas

cd app
pnpm run generate
pnpm run typecheck
rg -n "from '@/api-client" src/features src/routes
rg -n "z[A-Z].*Writable" src/features
```

## Output

- Regeneration status and changed generated files.
- List downstream compile or schema adaptation tasks.
- Confirm no manual edits in `api-client/*.gen.ts`.
