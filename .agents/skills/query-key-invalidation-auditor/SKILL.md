---
name: query-key-invalidation-auditor
description: Audit and fix TanStack Query invalidation after mutations. Use when adding mutations, debugging stale UI, or verifying REST and GraphQL query key invalidation patterns.
---

# Query Key Invalidation Auditor

Prevent stale UI by enforcing generated query keys and complete invalidation flows.

## Workflow

1. Read cache invalidation rules:
   - `app/docs/02-conventions/query-key-invalidation.md`
   - `app/docs/03-patterns/state-management.md`
2. Inspect each mutation path (`create`, `update`, `delete`).
3. Verify query key usage:
   - Use generated `*QueryKey()` functions.
   - Avoid hardcoded arrays for REST entities.
4. Check multi-source entities:
   - Invalidate both REST and GraphQL keys where both feed the UI.
5. For optimistic updates:
   - Verify `onMutate`, rollback in `onError`, and final sync in `onSettled`.
6. Ensure `onSuccess` awaits invalidation when UI freshness depends on it.

## Useful commands

```bash
rg -n "invalidateQueries\\(|setQueryData\\(|cancelQueries\\(" app/src/features
rg -n "queryKey:\s*\[" app/src/features app/src/routes
rg -n "onMutate|onError|onSettled|onSuccess" app/src/features
```

## Output

- List invalidation gaps by mutation file.
- Provide exact replacement imports and query key calls.
- Flag cases requiring helper extraction in `features/<name>/queries/`.
