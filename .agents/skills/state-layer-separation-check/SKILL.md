---
name: state-layer-separation-check
description: Enforce separation between server state, feature UI state, and local component state. Use when introducing stateful UI logic, stores, or query-driven views.
---

# State Layer Separation Check

Keep Query, Store, URL state, and local state responsibilities cleanly separated.

## Workflow

1. Read state architecture references:
   - `app/docs/03-patterns/state-management.md`
   - `app/docs/02-conventions/query-key-invalidation.md`
2. Classify each state variable:
   - API data -> TanStack Query
   - Shared feature UI transitions -> TanStack Store
   - Shareable filter/sort/tab -> URL search params
   - Local ephemeral state -> `useState`
3. Detect anti-patterns:
   - Duplicating query data in UI store.
   - Deriving state through sync `useEffect` when render-time derivation is sufficient.
   - Mutation invalidation done in view components instead of mutation hooks.
4. Propose minimal extraction:
   - Move transitions into store actions.
   - Move API reads/writes into query/mutation layers.
5. Verify final data flow for reads and writes.

## Useful commands

```bash
rg -n "new Store\(|useStore\(|useState\(|useEffect\(" app/src/features app/src/functionals
rg -n "setState\(.*data|query\\.data" app/src/features
rg -n "invalidateQueries\(" app/src/features app/src/components
```

## Output

- Report state ownership mismatches by file.
- Provide target ownership map (Query/Store/URL/useState).
- List exact refactors required for clean separation.
