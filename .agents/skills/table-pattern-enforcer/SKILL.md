---
name: table-pattern-enforcer
description: Apply shared table patterns and reusable table primitives consistently. Use when creating list or detail tables, row actions, delete flows, and empty states.
---

# Table Pattern Enforcer

Standardize tables on shared primitives and consistent behavior.

## Workflow

1. Read table and composition references:
   - `app/docs/03-patterns/tables.md`
   - `app/docs/03-patterns/composition.md`
   - `app/docs/05-components/table-components.md`
2. Prefer shared primitives from `@/functionals/table`:
   - `FilterTableLayout` and `DataTable` for the list, `createActionsColumn` and
     `dataTableSortableHeader` for columns, `TableCard`, `TableActions` and
     `TableDeleteDialog` for cards and row actions.
   - The low-level `Table` primitive is `@/components/ui/table`; do not
     rebuild a table from raw markup.
3. Verify row actions:
   - Use standardized action buttons and confirmation dialog for delete.
4. Verify empty and loading states:
   - Add explicit i18n empty messages when business context needs clarity.
5. Verify table navigation and filtering behavior:
   - Use provided `DataTable` props (`getPath`, `getRowId`, `getSubRows`) before custom logic.
   - Search goes through `FilterTableLayout.Search`.
6. After mutations, ensure correct query invalidation for table freshness.

## Useful commands

```bash
rg -n "@/functionals/table|DataTable|TableCard|TableDeleteDialog" app/src
rg -n "Delete|onConfirm|invalidateQueries" app/src/features
```

## Output

- List deviations from shared table primitives.
- Provide exact component replacements and props adjustments.
- Highlight consistency gaps in row actions and delete confirmation.
