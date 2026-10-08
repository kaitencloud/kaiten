# `functionals/filters`

Client-side filtering for a list of rows: a hook that holds the filter state and
returns the filtered rows, and a toolbar that edits that state. It runs over
data that is already loaded and knows nothing about the API.

Import everything from `@/functionals/filters`. The rules that apply to every
functional are in [functionals.md](../../../docs/01-architecture/functionals.md).

## Usage

Describe each filterable field, hand the rows and the fields to
`useFilterBuilder`, then render the toolbar around the table.

```tsx
// app/src/features/customers/components/customer-table.tsx (abridged)
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { DataTable, FilterTableLayout } from '@/functionals/table';

const filterFields: FilterFieldDefinition<Customer>[] = [
  {
    id: 'name',
    label: 'Name',
    type: 'text',
    accessor: (customer) => customer.name,
    placeholder: 'Name',
  },
  {
    id: 'licenseTypes',
    label: 'License type',
    type: 'enum',
    accessor: (customer) => customer.licenseTypes,
    options: licenseTypeOptions,
  },
];

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
      </FilterTableLayout.ToolbarRow>
      <FilterTableLayout.Filters />
    </FilterTableLayout.Toolbar>
    <FilterTableLayout.Content>
      <DataTable columns={columns} data={filterController.filteredData} />
    </FilterTableLayout.Content>
  </FilterTableLayout>
);
```

`FilterTableLayout` belongs to the [`table`](../table/README.md) functional. Most
list screens use it.

## Field definition

`FilterFieldDefinition<T>` (`types/filter.types.ts`) describes one filterable
field of a row of type `T`.

| Property | Meaning |
| --- | --- |
| `id`, `label` | Identifier used by the controller and text shown in the UI |
| `type` | `text`, `enum`, `enum_list`, `boolean`, `number` or `date` |
| `accessor` | Reads the field's value from a row |
| `options` | `{ label, value }[]` for `enum` and `enum_list` fields |
| `placeholder` | Placeholder of the value input |
| `searchable` | For a field with options: adds a search box above the list. Off by default |
| `quickAccess` | Shows the field as a permanent chip |
| `normalFilterable` | The field can be picked from the filter menu. Default `true` |
| `advancedFilterable` | The field can be used in an advanced rule. Default `true` |

An `enum_list` field holds several values. They are stored in one string,
joined with `FILTER_MULTI_SELECT_SEPARATOR` (the ASCII unit separator, so a
value that contains a comma survives).

## Hook

`useFilterBuilder<T>(props)` returns a controller. Its props
(`UseFilterBuilderProps`, `types/use-filter-builder.types.ts`):

| Prop | Meaning |
| --- | --- |
| `data`, `fields` | The rows and the field definitions |
| `pinnedFilterIds` | Fields shown as an always-visible search input |
| `quickAccessFilterIds` | Extra quick-access fields, on top of the fields with `quickAccess: true` |
| `defaultNormalFilterIds` | Filters that are active when the screen opens |
| `defaultAdvancedCombinator`, `defaultAdvancedRules` | Initial advanced rules and how they combine (`and` by default) |
| `debounceMs` | Delay before a changed value reaches `filteredData`. Default 200 |
| `resetOnDataChange` | Reset every filter when `data` changes identity. Default `false` |

The controller (`UseFilterBuilderResult`) exposes `filteredData`, the state and
actions of the normal filters (`normal`) and of the advanced rules (`advanced`),
`hasActiveFilters` and `resetAll`.

## Toolbar

| Component | Use |
| --- | --- |
| `FilterToolbar` | Ready-made toolbar. `showAdvancedOption` defaults to `true` |
| `FilterToolbarProvider` | Context for a custom toolbar. `showAdvancedOption` defaults to `false` |
| `FilterSearchInput`, `FilterToolbarQuickAccessFilters`, `FilterToolbarFilterButton`, `FilterToolbarFiltersRow`, `FilterToolbarContent` | Building blocks, used inside the provider |

Compose the blocks when the layout is specific:

```tsx
// app/src/features/notifications/components/notifications-page-content.tsx (abridged)
<FilterToolbarProvider controller={controller}>
  <div className="mt-6 flex flex-wrap items-center gap-3">
    <FilterToolbarQuickAccessFilters />
    <FilterToolbarFilterButton />
  </div>
  <FilterToolbarFiltersRow className="mt-3" />
</FilterToolbarProvider>
```

Do not add structural props to `FilterToolbar`: a different layout is a
different composition. Every label can be overridden with the `labels` prop of
`FilterToolbar` and `FilterToolbarProvider` (`Partial<FilterToolbarLabels>`);
the defaults come from the `Common.*` i18n keys.

## Filter modes

| Mode | Behaviour | How to enable |
| --- | --- | --- |
| Pinned | A search input that is always visible and cannot be removed | `pinnedFilterIds` |
| Quick access | A permanent chip; a click opens the option list or the value editor | `quickAccess: true` on the field, or `quickAccessFilterIds` |
| Normal | Picked from the "Filter" menu, then shown as a chip in the filters row | `normalFilterable` (default) |
| Advanced | Rules made of a field, an operator and a value, combined with AND or OR | `advancedFilterable` (default) and `showAdvancedOption` |

## Chips of fields with options

A field that is filtered by picking from a list opens its chip directly on the
option list (`FilterOptionList`, built on the same `Command` as the "Filter"
menu): `enum` and `enum_list` fields that have options, and `boolean` fields.
The chip already names the field and such a field has a single operator. `text`,
`number` and `date` fields keep the editor with an operator.

| Type | List |
| --- | --- |
| `enum_list` | One checkbox per option. Each click toggles it and the list stays open. "Clear filter" sits at the bottom of the list |
| `enum` | "All", then the options. Choosing one closes the list |
| `boolean` | True and false only. Choosing the current value clears it, like "Clear filter" |

- Search: there is no search box by default. `searchable: true` adds one, and an
  option matches when it contains every word typed, in any order.
- Width: the list follows its options between 280 and 420 px (at most 92vw). A
  long label wraps anywhere. A searchable list takes 420 px from the start so it
  does not resize while the user types.
- Chip label: "Label: value", or "Label: N selected" beyond two values
  (`Common.selectedCount`), without the operator. A quick-access chip truncates
  its label at 320 px and keeps the full text in its `title`.
- Accessibility: the list is named after its field (`aria-label`), since nothing
  else says what it holds. The check beside an `enum_list` option is a mark drawn
  from the option's own `aria-checked`, not a checkbox: a control inside an
  option nests one in another, which a screen reader cannot announce.

## Implementation notes

- The evaluation logic (`logic/filter-logic.ts`, `logic/filter-value-evaluator.ts`)
  is pure: no React, tested without `renderHook`.
- The filter state lives in a TanStack Store (`store/filter-builder-store.ts`).
  The toolbar keeps its own open/closed state in a second, small store
  (`hooks/use-filter-toolbar-ui-state.ts`).
- Normal filter values are debounced before they reach `filteredData`. Advanced
  rules are applied immediately.
- The `enum_list` type comes with the operators `contains_any` and
  `contains_all`. It is what
  [`metadata-fields`](../metadata-fields/README.md) uses for array values.

```
filters/
├── components/   toolbar/ (toolbar and its parts), shared/ (option list, inputs, menus), advanced/ (rules)
├── hooks/        use-filter-builder and the hooks it is made of, use-filter-toolbar-ui-state
├── logic/        pure evaluation, operators, defaults, selectors
├── store/        filter-builder-store.ts
├── types/        filter.types.ts, toolbar.types.ts, use-filter-builder.types.ts
├── constants.ts  FILTER_MULTI_SELECT_SEPARATOR
├── stories/      Storybook
└── index.ts      public API
```
