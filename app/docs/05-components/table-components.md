# Table components

The shared table components are in `app/src/functionals/table/`, one of the [functionals](../01-architecture/functionals.md). Import them from `@/functionals/table`, never from an internal path. This page groups them by use. The props of each are documented in the [README of the functional](../../src/functionals/table/README.md) and on the types in `app/src/functionals/table/types/data-table.types.ts`. The [tables pattern](../03-patterns/tables.md) shows how they combine on a screen.

Paths below are relative to `app/src/functionals/table/`.

## A list page

| Component | Role | Source |
| --- | --- | --- |
| `FilterTableLayout` | The layout of a list screen: `.Toolbar`, `.ToolbarRow`, `.Search`, `.Actions`, `.Filters` and `.Content`, around a `FilterToolbarProvider` from the [`filters` functional](../../src/functionals/filters/README.md). It takes the controller returned by `useFilterBuilder`. | `components/layout/filter-table-layout.tsx` |
| `DataTable` | The table: client-side sorting and pagination, row links, expandable child rows, `default` and `simple` variants. | `components/core/data-table.tsx` |

## A table in a card

| Component | Role | Source |
| --- | --- | --- |
| `TableCard` | A `Card` with a header (`.Header`, `.HeaderLeading`, `.HeaderIcon`, `.HeaderHeading`, `.HeaderTitle`, `.HeaderSubtitle`, `.HeaderActions`), an optional `.Toolbar`, and a `.Table` that renders a `DataTable`. `.Content` holds a `DataTable` that needs props `.Table` does not forward. | `components/layout/table-card.tsx` |

## Columns

| Export | Role | Source |
| --- | --- | --- |
| `ColumnDef`, `Row`, `Cell`, `Column`, `TableInstance`, `DataTableColumnMeta` | The TanStack Table v9 types, bound to the table's feature set. | `types/data-table.types.ts`, `logic/data-table-features.ts` |
| `dataTableSortableHeader(title)`, `DataTableSortHeader` | A column header that toggles the sort. | `components/core/data-table-sort-header.tsx` |
| `DataTableRowExpander` | The button that opens a row's children (`getSubRows`). | `components/core/data-table-row-expander.tsx` |
| `dataTableFeatures`, `deriveDefaultSortingFromColumns`, `getColumnSortId` | The feature set and the sorting helpers. Screens rarely need them. | `logic/data-table-features.ts`, `logic/data-table-sorting.ts` |

## Row actions

| Component | Role | Source |
| --- | --- | --- |
| `createActionsColumn(render)` | The right-aligned "Actions" column, not sortable. | `components/actions/table-actions-column.tsx` |
| `TableActions` | Lays out the buttons of a row and stops click propagation. | `components/actions/table-actions.tsx` |
| `TableActionButton` | A ghost icon button with a tooltip, which is also its accessible label. | `components/actions/table-action-button.tsx` |
| `TableDeleteDialog` | A delete button that asks for a confirmation. | `components/actions/table-delete-dialog.tsx` |
| `TableForbiddenDeleteButton` | A disabled delete button whose tooltip says why. | `components/actions/table-forbidden-delete-button.tsx` |

## Dialogs opened from a cell

| Component | Role | Source |
| --- | --- | --- |
| `TableLinkedItemsDialog` | A link that opens a read-only table of related items. | `components/core/table-linked-items-dialog.tsx` |
| `TableJsonDialog` | A button that opens a JSON value. An empty value renders a placeholder instead. | `components/core/table-json-dialog.tsx` |

## Not exported

`components/core/data-table-content.tsx` (rows, cells and their click handling) and `components/core/data-table-pagination.tsx` (the pager) are parts of `DataTable`. `app/src/components/ui/table.tsx` holds the markup primitives (`Table`, `TableRow`, `TableCell` and their siblings) that `DataTable` renders with. Lists use `DataTable`; a few connector screens use the primitives directly (`app/src/features/connectors/attio/components/`).

## Tests and stories

- Unit tests: `app/src/functionals/table/__tests__/` and `app/src/functionals/table/logic/__tests__/`.
- Stories: [`data-table.stories.tsx`](../../src/functionals/table/stories/data-table.stories.tsx) (`Functionals/DataTable`: default, empty, child rows, clickable rows, pagination, the `simple` variant, sorting) and [`table-components.stories.tsx`](../../src/functionals/table/stories/table-components.stories.tsx) (`Functionals/Table`: the action buttons, alone and in a table). Run them with `pnpm run storybook` from `app/`.
