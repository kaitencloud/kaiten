# Tables

The console shows lists of rows with `DataTable` from `@/functionals/table`, built on TanStack Table v9. This page shows how the pieces fit together on the screens that exist. The exports and props are documented in the [README of the functional](../../src/functionals/table/README.md), and the components are grouped by use in [table components](../05-components/table-components.md).

## Which composition for which screen

| Screen | Build it with | Example |
| --- | --- | --- |
| A list page: search, filters, a create button, a table | `FilterTableLayout` around a `DataTable` | `app/src/features/customers/components/customer-table.tsx` |
| A table inside a card of a detail page | `TableCard` with `TableCard.Table` | `app/src/features/feature-flags/components/feature-flag-detail/variants-tab.tsx` |
| Related items listed from a cell or a counter | `TableLinkedItemsDialog` | `app/src/features/customers/components/customer-instances-display.tsx` |
| A JSON value shown from a cell | `TableJsonDialog` | `app/src/features/feature-flags/components/feature-flag-table.tsx` |
| A list the server filters and pages | `DataTable` with `pagination={false}`, filters in the URL and a "Load more" button | `app/src/features/billing/components/invoices/invoices-list.tsx` |

## A list page

A route loads the rows, a page component reads them and hands them to a table component of the feature. The route side is in [routes as assemblers](./routes-as-assemblers.md). The table component builds the columns, describes the filterable fields and renders the layout:

```tsx
// app/src/features/customers/components/customer-table.tsx (abridged)
const filterController = useFilterBuilder({
  data: customers,
  fields: filterFields,
  pinnedFilterIds: ['name'],
  debounceMs: 200,
  resetOnDataChange: true,
});

return (
  <FilterTableLayout controller={filterController}>
    <FilterTableLayout.Toolbar>
      <FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Search filterId="name" />
        <FilterTableLayout.Actions>
          <GradientButton
            to="/customers/new"
            label={t('Pages.Customers.Mutation.titleNew')}
          />
        </FilterTableLayout.Actions>
      </FilterTableLayout.ToolbarRow>
      <FilterTableLayout.Filters />
    </FilterTableLayout.Toolbar>

    <FilterTableLayout.Content>
      <DataTable
        className="h-full"
        columns={columns}
        data={filterController.filteredData}
        getPath={getCustomerPath}
        bodyScrollable
      />
    </FilterTableLayout.Content>
  </FilterTableLayout>
);
```

- `useFilterBuilder` holds the filter state and returns `filteredData`. The field definitions (`FilterFieldDefinition`) and the toolbar are described in the [README of the `filters` functional](../../src/functionals/filters/README.md).
- `FilterTableLayout` takes the controller. `.Search` is the pinned search input for `filterId` plus the "Filter" button, `.Actions` holds the page actions on the right, `.Filters` shows the active filter chips, and `.Content` holds the table.
- `bodyScrollable` with `className="h-full"` makes the body scroll under a sticky header and the table fill its parent. The page around it fixes its height: see [page scrolling](./page-scrolling.md).
- Filtering, sorting and paging run in the browser, on rows already loaded, so the whole list is loaded before it reaches the table. Two mechanisms do it, and both walk a cursor-paginated endpoint to its end with `fetchAllPages` (`app/src/lib/api/pagination.ts`). The REST lists, such as the entitlements, go through the helpers of `app/src/lib/api/all-pages-query-options.ts`. The customer, instance and release lists are GraphQL queries that call `fetchAllPages` themselves (`app/src/domains/customer-management/queries/use-customers-with-instances.ts`, `use-instances-with-relations.ts`, and `app/src/domains/release-management/queries/release-management-query-options.ts` for the releases).

Other list pages follow the same shape: `app/src/features/releases/components/release-overview/tables/release-table.tsx`, `app/src/features/entitlements/components/entitlement-table.tsx`, `app/src/features/instances/components/instance-table.tsx`. The `CustomerTable` story (`app/src/features/customers/components/stories/customer-table.stories.tsx`) renders one in Storybook.

## Columns

```tsx
// app/src/features/customers/components/customer-table.tsx (abridged)
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
  FilterTableLayout,
} from '@/functionals/table';

const columns = useMemo<ColumnDef<Customer>[]>(
  () => [
    {
      accessorKey: 'name',
      header: dataTableSortableHeader(t('Pages.Customers.Table.Columns.name')),
    },
    {
      accessorKey: 'domain',
      enableSorting: false,
      header: t('Pages.Customers.Table.Columns.domain'),
      cell: ({ row }) =>
        row.original.domain ? (
          <span className="font-mono text-xs">{row.original.domain}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    createActionsColumn<Customer>((customer) => (
      <CustomerTableActions customer={customer} />
    )),
  ],
  [t],
);
```

- **Types come from `@/functionals/table`.** TanStack Table v9 types take the table's feature set as their first parameter. The functional binds it (`dataTableFeatures`) and exports `ColumnDef<TData>`, `Row`, `Cell`, `Column` and `TableInstance` already bound, so a screen writes `ColumnDef<Customer>`. The library's own `ColumnDef<Customer>` from `@tanstack/react-table` does not type-check.
- **A sortable header is `dataTableSortableHeader(title)`.** It renders a button that toggles the sort and announces the state to screen readers. `enableSorting: false` turns the sort off for a column, as `createActionsColumn` does for its own.
- **`meta`** takes `headerClassName` and `cellClassName` (`DataTableColumnMeta`, in `app/src/functionals/table/logic/data-table-features.ts`) and `defaultSort: 'asc' | 'desc'`. The first column that sets `defaultSort` gives the table its initial sort, as the date column does in `app/src/features/webhooks/components/webhook-history/webhook-history-columns.tsx`. The `initialSorting` prop of `DataTable` overrides it.
- **Header texts are translation keys**, written in full and declared in both locales: see [i18n](../02-conventions/i18n.md). Wrap the column array in `useMemo` with `t` as a dependency, as the example does.

## Row actions

`createActionsColumn(render)` adds the right-aligned "Actions" column. Inside it, put `TableActions` and the shared buttons:

```tsx
// app/src/features/customers/components/customer-table-actions.tsx (abridged)
<TableActions>
  {customer.nbInstances > 0 ? (
    <TableForbiddenDeleteButton
      message={t('Pages.Customers.Table.warningDelete')}
    />
  ) : (
    <TableDeleteDialog name={customer.name} onConfirm={handleConfirm} />
  )}
</TableActions>
```

- **Never delete without a confirmation.** `TableDeleteDialog` wraps `DeleteConfirmationDialog` and calls `onConfirm` only once confirmed. `title`, `description`, `confirmDisabled` and `onOpenChange` are optional: `app/src/features/entitlements/components/entitlement-table-actions.tsx` passes `description`, `confirmDisabled` and `onOpenChange` to explain a delete that a license blocks.
- **A delete that is not allowed** shows `TableForbiddenDeleteButton` with the reason as its `message`.
- **Other icon buttons** use `TableActionButton`. Its `tooltip` is also its accessible label.
- **The mutation lives in the actions component of the feature**, next to the table, never in a route. After a delete, refresh the list. Two helpers exist: `optimisticDeleteCallbacks` (`app/src/lib/optimistic-mutations.ts`, used by the entitlement actions) and `forgetDeletedCustomerQueries` (`app/src/domains/customer-management/queries/customer-query-invalidation.ts`, used by the customer actions, which also drops the deleted customer's detail query). See [query key invalidation](../02-conventions/query-key-invalidation.md).
- Do not build custom buttons when these cover the need.

## Opening a row

`getPath` says where a row leads. The cell of the `linkColumnId` column (`name` by default) becomes a real link: Tab and Enter from the keyboard, cmd or ctrl click and middle click for a new tab, "Open in new tab" and "Copy link address" from the context menu. A click elsewhere on the row follows the same path, in a new tab with cmd, ctrl or shift, or the middle button.

```tsx
// app/src/features/releases/components/release-overview/tables/release-table.tsx (abridged)
const router = useRouter();

const getReleasePath = (release: ReleaseManagementOverviewRelease) =>
  release.slug
    ? router.buildLocation({
        to: '/releases/$releaseSlug',
        params: { releaseSlug: release.slug },
      }).pathname
    : undefined; // no path: neither a link nor a click

<DataTable
  className="h-full"
  columns={columns}
  data={filterController.filteredData}
  getPath={getReleasePath}
  linkColumnId="version"
  bodyScrollable
/>;
```

`router.buildLocation` keeps the route typed: renaming a route breaks the build, not a link. `isRowClickable` adds a condition per row.

- `onClickRow` is for rows that open something other than a page (a dialog, a panel). Without a path there is no link and no new tab.
- Do not combine `enableRowKeyboardNavigation`, which makes the row a `role="button"`, with `getPath`: the link would end up inside a button.
- A control inside a cell must not trigger the row. `TableActions`, `TableActionButton` and the triggers of `TableJsonDialog` and `TableLinkedItemsDialog` stop the click already. Dialogs, popovers and menus opened from a cell render in a portal, and the row ignores their clicks and keys (`isEventFromRow` in `app/src/functionals/table/components/core/data-table-content.tsx`): no `stopPropagation` is needed on their content. A custom control marks itself with a `data-row-actions` attribute.

## Child rows

A row can carry child rows, listed under it once it is open: a component and its versions, under `/releases/components`. The data arrives already grouped and `getSubRows` says where the children are.

```tsx
// app/src/features/components/components/components-table.tsx (abridged)
<DataTable<ComponentCatalogEntry>
  className="h-full"
  columns={columns}
  data={groups}
  getRowId={getComponentCatalogEntryId}
  getSubRows={getComponentCatalogEntryVersions}
  // A click anywhere on a component with several versions opens them.
  isRowClickable={(entry) =>
    getComponentCatalogEntryVersions(entry) !== undefined
  }
  onClickRow={(row) => row.toggleExpanded()}
  bodyScrollable
/>
```

- Rows start collapsed. A cell places `DataTableRowExpander` to open them: it sets `aria-expanded`, and the caller provides its `label`. On a row without children it leaves an empty slot of the same width, so the column stays aligned.
- In a `cell`, `row.depth` tells a parent (`0`) from its children (`1`).
- The page size counts parents only: children always show on their parent's page.
- Give `getRowId`. An open row stays open when the data changes (a filter, a refetch) as long as `getRowId` finds it again.
- To open a row by clicking it, use `onClickRow` as above, with `isRowClickable` limited to rows that have children. The expander button does not trigger the row click.

TanStack's own `grouping` is not registered: its group rows are synthetic (their `row.original` is the first row of the group) and each column would need an aggregation function.

## A table in a card

`TableCard` is a compound component: a `Card` with a structured header and a table.

```tsx
// app/src/features/feature-flags/components/feature-flag-detail/variants-tab.tsx (abridged)
<TableCard>
  <TableCard.Header>
    <TableCard.HeaderLeading>
      <TableCard.HeaderIcon>
        <FeatureFlagIcon />
      </TableCard.HeaderIcon>
      <TableCard.HeaderHeading>
        <TableCard.HeaderTitle className="text-lg">
          {t('Pages.FeatureFlags.Detail.Variants.definition.title')}
        </TableCard.HeaderTitle>
        <TableCard.HeaderSubtitle>
          {t('Pages.FeatureFlags.Detail.Variants.definition.description')}
        </TableCard.HeaderSubtitle>
      </TableCard.HeaderHeading>
    </TableCard.HeaderLeading>
  </TableCard.Header>
  <TableCard.Table
    columns={columns}
    data={variants}
    variant="simple"
    emptyMessage={t(
      'Pages.FeatureFlags.Detail.Variants.definition.empty',
    )}
  />
</TableCard>
```

- Use `variant="simple"` inside a card or a dialog: the table drops its own border and rounded corners, so the card does not contain a second card. The variant is visual only. Pagination stays governed by the `pagination` prop.
- `TableCard.Toolbar` sits between the header and the table and takes any controls. It does not use the `filters` functional: a list that needs filter chips and advanced rules is a `FilterTableLayout`. The audit trail tab of an instance shows a toolbar with its own filters: `app/src/features/instances/components/instance-detail/tabs/audit-trail/instance-detail-audit-trail-tab.tsx`.
- `TableCard.Table` forwards a subset of the `DataTable` props: `columns`, `data`, `variant`, `emptyMessage`, `pagination`, `getPath`, `linkColumnId`, `onClickRow`, `isRowClickable`, `getRowClassName`, `tableClassName`, plus `contentClassName`. When a table in a card needs more (`getSubRows`, `getRowId`, `bodyScrollable`), put a `DataTable` in `TableCard.Content` instead.
- The composition follows the convention of [composition](./composition.md): a root and named parts, not a long list of props.

## A list the server filters and pages

The lists above load every row and filter, sort and page them in the browser. That only works for a list of the size of a catalog. A list that grows with time, such as the invoices of an organization or the usage reports of a metered line, is paged by the API, which also does the filtering: the screen reads one page, and a filter run on that page would miss the rest. These lists follow another shape:

```tsx
// app/src/features/billing/components/invoices/invoices-list.tsx (abridged)
const query = useInfiniteQuery(invoicesQueryOptions(filters));
const invoices = useMemo(
  () => query.data?.pages.flatMap((page) => page.items) ?? [],
  [query.data],
);

<InvoicesTable bodyScrollable className="h-full" invoices={invoices} />
{query.hasNextPage ? (
  <Button onClick={() => void query.fetchNextPage()}>
    {t('Pages.Billing.Invoices.loadMore')}
  </Button>
) : null}
```

- **The filters are the API's, and they live in the URL.** The route reads them with `validateSearch`, hands them to the page and writes them back with `navigate({ search })`, so that a list can be linked to and survives a reload. The same object is the query the list sends and, where there is one, the query of its export. A value that is no filter is dropped field by field, so that a bad link opens the list with the rest. The usage history of an entitlement of an instance, a drawer and not a page, keeps its period the same way (`?from=` and `?to=` beside `?history=`, written with `replace` so that typing a day adds no history entry).
- **The query is infinite**, under the key the generated options give the operation, so that the invalidation helpers reach it under any filter. The first page is warmed by the loader with `prefetchInfiniteQuery`, which never throws; with `retryOnMount: false` a refusal the loader met is the answer the page shows, once.
- **`pagination={false}` and no sort.** The pager of `DataTable` pages the rows already loaded, and a column that sorts them would put the rest of the list in the wrong place. The order is the API's.
- **"Load more", and what it counts.** The button reads the next page with the same filters and the rows already read stay where they are. Say how many were read ("50 invoices shown") with `aria-live="polite"`, never how many there are: the API does not say.
- **The states are the page's.** A skeleton while the first page is on the way, the error with the API's own words and a Retry (a refusal of the next page is shown under the rows that were read), an empty state that says whether a filter is why, and the table. Use a bounded `DataTable` with `bodyScrollable` inside `Page className="h-full min-h-0 overflow-hidden"`, as the paragraph on lists above does, rather than a `ScrollArea` around the page: a scroll area lets its content grow to its natural width, which can push the columns out of the screen. The lists of the billing feature, of the instances and of the customers draw these states with `PagedListSkeleton`, `ListEmptyState` and `LoadMoreFooter` (`app/src/domains/billing/components/paged-list/`) instead of copies. They started in the billing feature and moved up to its domain when a second feature paged a list: see [extract late](../AI_CONTEXT.md#principles).

The usage reports behind an invoice line are the same shape inside cards (`app/src/features/billing/components/line-drilldown/`): the rows read are grouped by the window they counted in, one `TableCard` per window.

## Pagination and empty states

- `DataTable` paginates by default: 10 rows a page, page sizes 10, 20, 30 and 50, and the pager appears once there is more than one page. `pagination={false}` turns it off, for a short list (`app/src/features/licenses/components/license-versions-table.tsx`). An object sets `defaultPageSize`, `pageSizeOptions` and `showPageSizeSelector` (shown by default). `pagination={{ defaultPageSize: 5 }}` is what the audit trail tab uses.
- `TableLinkedItemsDialog` never paginates: its table is `variant="simple"` with `pagination={false}`, so it stays compact and read-only. Give it a `title` and a `triggerLabel`, and a `description` when the context needs one.
- When `data` is empty, `DataTable` shows `emptyMessage`, or the `Common.noResults` translation when there is none. Pass a specific message when the empty state means something for the screen. The components table passes its own message when the catalog is empty and keeps the default one when a filter hides everything (`app/src/features/components/components/components-table.tsx`).

## Tests and stories

- Unit tests: `app/src/functionals/table/__tests__/` and `app/src/functionals/table/logic/__tests__/`.
- Stories: `app/src/functionals/table/stories/data-table.stories.tsx` (`Functionals/DataTable`) and `app/src/functionals/table/stories/table-components.stories.tsx` (`Functionals/Table`). Feature tables have their own stories next to them, such as `app/src/features/customers/components/stories/customer-table.stories.tsx`.
