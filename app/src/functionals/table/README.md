# `functionals/table`

The shared table building blocks: `DataTable` (on TanStack Table v9), the page
layout that pairs it with the filter toolbar, a card variant, row actions and two
dialogs for compact tables.

Import everything from `@/functionals/table`. The rules that apply to every
functional are in [functionals.md](../../../docs/01-architecture/functionals.md);
the way screens assemble a list page is in
[tables.md](../../../docs/03-patterns/tables.md).

## What it exports

| Export | Role |
| --- | --- |
| `DataTable` | The table: client-side sorting, pagination, expandable rows, row links |
| `dataTableSortableHeader(title)`, `DataTableSortHeader` | A column header that toggles the sort |
| `DataTableRowExpander` | The toggle that opens a row's children (`getSubRows`) |
| `FilterTableLayout` | Page layout for a list: toolbar, filters row and table content |
| `TableCard` | Card with a header, an optional toolbar and a table |
| `createActionsColumn(render)` | The right-aligned "Actions" column |
| `TableActions`, `TableActionButton` | Container and icon button (with tooltip) for row actions |
| `TableDeleteDialog`, `TableForbiddenDeleteButton` | Delete button with a confirmation dialog, and its disabled variant |
| `TableLinkedItemsDialog` | A link that opens a read-only table of related items |
| `TableJsonDialog` | A button that opens a JSON value in a dialog |
| `ColumnDef`, `Row`, `Cell`, `Column`, `TableInstance`, `DataTableProps`… | Types, see below |
| `dataTableFeatures`, `deriveDefaultSortingFromColumns`, `getColumnSortId` | Feature set and sorting helpers |

## TanStack Table v9 types

In v9 every type takes the table's feature set first. The functional binds those
types to its own features, so screens write `ColumnDef<Customer>` and import it
from `@/functionals/table`, never from `@tanstack/react-table`.

Per-column options go in `meta` (`DataTableColumnMeta`): `cellClassName`,
`headerClassName` and `defaultSort` (`'asc'` or `'desc'`: the first column that
sets it gives the table its initial sort).

## `DataTable`

```tsx
// app/src/features/customers/components/customer-table.tsx (abridged)
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
} from '@/functionals/table';

const columns: ColumnDef<Customer>[] = [
  {
    accessorKey: 'name',
    header: dataTableSortableHeader(t('Pages.Customers.Table.Columns.name')),
  },
  // ...
  createActionsColumn<Customer>((customer) => (
    <CustomerTableActions customer={customer} />
  )),
];

<DataTable
  columns={columns}
  data={customers}
  getPath={getCustomerPath}
  bodyScrollable
/>;
```

The props are documented on `DataTableProps` (`types/data-table.types.ts`). The
ones screens reach for:

| Prop | Behaviour |
| --- | --- |
| `getPath`, `linkColumnId` | A row leads to a path. The cell of the `linkColumnId` column (default `name`) becomes a real link, and a click anywhere else on the row follows it. Modified and middle clicks open a new tab |
| `onClickRow`, `isRowClickable` | Row click handler, and which rows react. `enableRowKeyboardNavigation` adds Enter and Space |
| `pagination` | On by default (10 rows a page, page sizes 10, 20, 30, 50); the pager appears once there is more than one page. `false` turns it off; an object sets `enabled`, `defaultPageSize`, `pageSizeOptions` and `showPageSizeSelector` |
| `initialSorting` | Initial sort. Without it, the first column with `meta.defaultSort` decides |
| `getSubRows`, `getRowId` | Child rows, opened with `DataTableRowExpander`. Give `getRowId` as well, so rows stay expanded by id when the data changes. The page size counts top-level rows only |
| `variant` | `default` (bordered card look) or `simple` (borderless, for a table inside a card or dialog) |
| `bodyScrollable` | The body scrolls under a sticky header; the table fills its parent's height |
| `emptyMessage`, `getRowClassName`, `className`, `tableClassName` | Empty state and styling |

A control inside a cell must not trigger the row. `TableActions` and
`TableActionButton` stop click propagation; a custom control marks itself with a
`data-row-actions` attribute.

## `FilterTableLayout`

The layout of a list screen. It wraps a `FilterToolbarProvider` (from
[`filters`](../filters/README.md)) around its parts:

- `FilterTableLayout.Toolbar` and `.ToolbarRow` lay out the toolbar;
- `.Search` renders the pinned search input for `filterId` and the "Filter" button;
- `.Actions` holds the page actions, aligned to the right;
- `.Filters` renders the filters row;
- `.Content` holds the table.

`showAdvancedOption` (advanced rules) is `false` by default. The screen builds the
controller with `useFilterBuilder` and passes it as `controller`; the customer
table above shows the full assembly.

## `TableCard`

A compound component: a `Card` with a structured header and a table.

| Part | Role |
| --- | --- |
| `TableCard.Header` | `CardHeader`: heading and actions side by side from `sm` |
| `.HeaderLeading`, `.HeaderIcon`, `.HeaderHeading`, `.HeaderTitle`, `.HeaderSubtitle` | Left side of the header |
| `.HeaderActions` | Right side of the header |
| `.Toolbar` | Row of controls between the header and the table |
| `.Content` | `CardContent` without padding |
| `.Table` | A `DataTable` inside `.Content` (`columns`, `data`, `variant`, `pagination`, `getPath`, `onClickRow`, …) |

```tsx
// app/src/features/instances/components/instance-detail/tabs/audit-trail/instance-detail-audit-trail-tab.tsx (abridged)
<TableCard>
  <TableCard.Header>…</TableCard.Header>
  <TableCard.Toolbar>
    <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
  </TableCard.Toolbar>
  <TableCard.Table
    columns={columns}
    data={filteredEntries}
    pagination={{ defaultPageSize: 5 }}
    variant="simple"
  />
</TableCard>
```

`.Toolbar` takes any controls. It does not use the `filters` functional; use
`FilterTableLayout` when a list needs filter chips and advanced rules.

## Dialogs

- `TableLinkedItemsDialog` shows a small read-only table for the items linked to
  a cell or a counter (the releases of a component, the instances of a
  customer). Props: `columns`, `data`, `title`, `triggerLabel`, and optionally
  `description`, `emptyMessage` and `dialogWidth`. The table inside is a
  `DataTable` with `variant="simple"` and no pagination.

  ```tsx
  // app/src/features/customers/components/customer-instances-display.tsx
  <TableLinkedItemsDialog
    columns={columns}
    data={instances}
    title={t('Pages.Customers.Table.Dialogs.instancesTitle')}
    description={t('Pages.Customers.Table.Dialogs.instancesDescription')}
    triggerLabel={t('Pages.Customers.Table.instanceCount', {
      count: instances.length,
    })}
  />
  ```

- `TableJsonDialog` shows a JSON object in a dialog (`title`, `triggerAriaLabel`,
  `value`, optional `triggerLabel`, `description`, `emptyMessage`). An empty value
  renders `emptyMessage` (`-` by default) instead of a button.

## Row actions

`createActionsColumn` builds the actions column (id `actions`, not sortable).
Inside it, `TableActions` lays buttons out, `TableActionButton` is an icon
button with a tooltip (its `tooltip` is also its accessible label),
`TableDeleteDialog` (`name`, `onConfirm`, and optionally `title`, `description`,
`confirmDisabled`, `onOpenChange`) asks for confirmation, and
`TableForbiddenDeleteButton` (`message`) is a disabled delete button that shows
why.

## Structure

```
table/
├── components/   core/ (DataTable and its parts, dialogs), layout/ (TableCard, FilterTableLayout), actions/
├── logic/        feature set, sorting and pagination helpers
├── types/        data-table.types.ts
├── stories/      Storybook
└── index.ts      public API
```
