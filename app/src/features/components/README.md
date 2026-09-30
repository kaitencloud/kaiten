# Components

The catalog of the components an organization ships. A component is a named, versioned piece of software, such as an API gateway or an auth service, that releases bundle. The catalog page lists every component with the releases that ship it, summarizes reuse and versioning in four cards, and lets a user create a component. It is the second tab of the release-management workspace, next to [releases](../releases/README.md) and [deployment zones](../deployment-zones/README.md).

## Routes

| URL | Route file | What it renders |
| --- | --- | --- |
| `/releases/components` | `app/src/routes/releases/components/route.tsx` | `ComponentsPageContent`. The loader preloads the component list and the release overview. The route is a layout: its `<Outlet />` renders after the page. |
| `/releases/components/new` | `app/src/routes/releases/components/new/index.tsx` | `ComponentFormDialog`, opened over the catalog. Closing the dialog, or creating the component, navigates back to `/releases/components`. |

The page shell and the tabs come from `app/src/functionals/release-management`. The creation dialog is not part of this feature: the release form of `features/releases` opens it as well, so it lives in `app/src/domains/release-management/component-catalog`. See [dialog via route](../../../docs/03-patterns/dialog-via-route.md) for the pattern.

A component has no detail page.

## Structure

```text
app/src/features/components/
├── components/
│   ├── component-releases-display.tsx    # "N releases" trigger and its dialog
│   ├── components-page-content.tsx       # reads the queries, builds the catalog, renders shell, cards and table
│   ├── components-stats-cards.tsx
│   ├── components-table.tsx              # filters, sorting, expandable rows
│   ├── components-table-filters.ts       # filter field definitions
│   ├── stories/components-catalog.stories.tsx
│   ├── __tests__/components-page-content.test.tsx
│   └── index.ts
├── queries/                              # componentsQueryOptions
├── types/                                # catalog row, group, entry and stats types
├── utils/components-catalog.ts           # the pure catalog logic, with __tests__/
├── index.ts
└── README.md
```

## Data

`ComponentsPageContent` reads two queries with `useSuspenseQuery`:

| Query | Source | Used for |
| --- | --- | --- |
| `componentsQueryOptions` | REST `GET /components`, every page (`allComponentsOptions` in `app/src/lib/api/all-pages-query-options.ts`) | one row per component version |
| `releaseManagementOverviewQueryOptions` | GraphQL `GetReleaseManagementOverview`, exported by `@/domains/release-management` | which releases ship each component, and the status of each release in the releases dialog |

`app/src/features/components/utils/components-catalog.ts` turns them into the model the table shows:

1. `buildComponentCatalogRows` makes one row per component version from the REST list and attaches the releases that ship it, read from the overview. Each release entry carries its status, worked out from the overview release by `getReleaseOverviewStatus`. A component that a release lists but the REST list does not is added from the release payload. Rows are sorted by name, then version.
2. `groupComponentCatalogRows` groups the versions of a name into one component. The API keeps each name and version pair unique within an organization, so the name is what makes versions one component. A group reads as its latest version and carries `versions`, latest first, and the releases of every version.
3. `getComponentCatalogStats` counts the groups for the four cards.

```ts
// app/src/features/components/components/components-page-content.tsx
const componentRows = useMemo(
  () => buildComponentCatalogRows(components?.items ?? [], releases ?? []),
  [components?.items, releases],
);
const stats = useMemo(
  () => getComponentCatalogStats(groupComponentCatalogRows(componentRows)),
  [componentRows],
);
```

The feature has no mutation. Creating a component through the dialog invalidates `listComponentsQueryKey()`, the key that `componentsQueryOptions` keeps, so the catalog refetches. See [query key invalidation](../../../docs/02-conventions/query-key-invalidation.md).

## Behaviour

- **Rows.** One row per component, showing its latest version. Columns are Name with the description, Version, Releases, Created and Created by. Name and Created sort.
- **Versions.** A component with several versions shows "N versions" and an expander, and a click anywhere on its row toggles it. Expanded, the component row keeps what belongs to the component itself (name, version count, releases of every version), and each version gets its own row below with its version, description, releases, creation date and author. A component with a single version has nothing to expand.
- **Version order.** Versions are free-form text. The latest is the highest, reading numbers as numbers (`1.10.0` after `1.9.0`); the most recent creation breaks a tie.
- **Filters.** Name (the search box), Version, Release and Created. They apply to versions before the grouping: a component shows the versions that match, and a filter that leaves a single version shows the component as that version. [Tables](../../../docs/03-patterns/tables.md) describes the shared table pattern.
- **Cards.** Total components, Releases using components (releases that ship at least one component), Shared across releases (components that appear in more than one release, whatever the version) and Versioned components (more than one version). They count the whole catalog, not the filtered table.
- **Releases dialog.** The "N releases" trigger opens a table of the releases that ship the component or the version: Release (a link to `/releases/$releaseSlug` when the release has a slug), Status and Created. The status is the one `/releases` shows for the release, Superseded included: the overview holds the zones a release ever reached, which tells a release that shipped and was replaced from one that never shipped. The rules are in [releases](../releases/README.md#status).
- **Empty states.** With no component in the organization the table reads "No components yet. Create one to get started."; when filters hide every row it shows the default "No results".
- **Creation.** The "Create Component" button opens the dialog. Name and Version are required (100 characters at most); Description is optional; Slug is optional and follows the name as it is typed. A success toast reads "Component created successfully". The catalog does not edit or delete components: a component is edited from the release form of [releases](../releases/README.md), and the console never deletes one.

## Tests

- `app/src/features/components/utils/__tests__/components-catalog.test.ts`: rows and release links, the status of each release, grouping, version order, keys, and the counts of the cards.
- `app/src/features/components/components/__tests__/components-page-content.test.tsx`: the catalog and its cards, expansion, the navigation to the dialog route, the name filter, the releases dialog, with the status of a superseded release, and the empty state.
- `app/src/features/components/components/__tests__/component-releases-display.test.tsx`: the releases dialog against the real English and French bundles: each status reads in the active language, and no raw English word is left in French.
- `app/src/features/components/components/stories/components-catalog.stories.tsx`: `Features/Components/ComponentCatalog`, with a `Default` and an `Empty` story. It runs in `pnpm run test:stories`.
- `app/e2e/app/release-management/components.create.spec.ts` creates a component from the catalog, and `workspace.read.spec.ts` opens the Components tab. `release-status.read.spec.ts` checks the status of a superseded release in the releases dialog, in English and in French.
- The dialog's schema is tested where it lives: `app/src/domains/release-management/component-catalog/schemas/__tests__/component-form.schema.test.ts`.

[Testing](../../../docs/06-testing/README.md) says how to choose between these kinds of test.

## Public API

`app/src/features/components/index.ts` exports `ComponentsPageContent` and `componentsQueryOptions`. Only `app/src/routes/releases/components/route.tsx` imports them; the other components of the feature stay internal. A feature root is importable by routes only (see [import rules](../../../docs/AI_CONTEXT.md#import-rules)).

```tsx
// app/src/routes/releases/components/route.tsx
import {
  ComponentsPageContent,
  componentsQueryOptions,
} from '@/features/components';
```

The feature imports no other feature. It shares code through the public entry points of `@/domains/release-management` (the overview query, the release status rules and the types) and `@/functionals/release-management` (the shell and the tabs).
