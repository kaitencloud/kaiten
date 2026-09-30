---
name: generate-api
description: Regenerate the Kaiten API client (OpenAPI SDK + GraphQL types) from the latest spec and verify no TypeScript errors are introduced.
disable-model-invocation: true
---

# Regenerate API Client

Regenerate all generated code from the API spec and verify compilation.

## Steps

1. **Regenerate everything** — `cd app && pnpm run generate`
   - This runs `generate-api-sdk` (OpenAPI → `api-client/`)
   - Then runs `generate-graphql` (GraphQL schema → types)
   - Always run the full `generate`: `generate-api-sdk` alone deletes `api-client/graphql/`.
   - If the Go API changed, run `task generate:oas` at the repository root first (it rewrites `app/openapi.yaml`).
   - If this fails: show the error output and stop.

2. **Type check** — `cd app && pnpm run typecheck`
   - If type errors appear after regeneration: show them. These mean the app code may need updating to match API changes.
   - If clean: report PASS.

3. **Report changes** — `git diff --stat -- app/src/api-client/`
   - List which generated files changed (types.gen.ts, zod.gen.ts, etc.)
   - Highlight if new endpoints were added or existing ones changed.

## Output

Report:
- Whether generation succeeded
- Type check result
- Summary of changed generated files (e.g., "3 new query options, 1 modified type")
- Any type errors that need manual fixing in app code

## Reminder

Per `app/docs/01-architecture/overview.md`:
- `api-client/zod.gen.ts` is the single source of truth for Zod schemas — never redefine manually
- `api-client/@tanstack/react-query.gen.ts` contains the generated query keys and options — always use these
- After regeneration, check if any `features/*/schemas/*.schema.ts` need updating to reflect API changes
