# Functionals

`app/src/functionals/` holds advanced, reusable UI: a data table, a filter
toolbar, a page shell, a code editor. A functional carries real UI behaviour
(state, dedicated hooks, orchestration) and never touches the API client, so any
feature can use it.

This page says what belongs in `functionals/`, the rules a functional follows, and
lists the ones that exist. The API of a large functional is documented in its own
`README.md`, next to the code.

## Where a module belongs

| | `components/` | `functionals/` | `domains/` | `features/` |
| --- | --- | --- | --- | --- |
| Non-trivial UI logic (store, dedicated hooks, orchestration) | no | yes | no | yes |
| Reusable across features | yes | yes | yes | no |
| Carries business contracts, read models or queries | no | no | yes | yes |
| Owns a screen, reached from a route | no | no | no | yes |
| Simple presentational component | yes | no | no | no |

Move a component from `components/` to `functionals/` when it gains real UI
orchestration and several features need it. Complexity alone is not a reason to
take code out of a feature. `StackedFormDialog` is one that earned it: it owns
shared behaviour (a wide dialog, a standard header, a discard prompt), not just
markup.

All the layers are described in [AI_CONTEXT.md](../AI_CONTEXT.md#layers), and each
folder of `app/src` in [folder-structure.md](./folder-structure.md).

## Rules

The rules are stated once, in [AI_CONTEXT.md](../AI_CONTEXT.md); this section
gives what is specific to functionals.

- **Imports.** A functional imports `components/`, `hooks/`, `lib/` and other
  functionals, never `api-client/`, `domains/`, `features/` or `routes/`
  (`functional-boundary` in [Import rules](../AI_CONTEXT.md#import-rules)).
- **Public API.** `index.ts` is the only entry point. Other code imports
  `@/functionals/<name>`, for example
  `import { useFilterBuilder } from '@/functionals/filters'`; an inner path such
  as `@/functionals/filters/hooks/use-filter-builder` fails
  `functional-public-api`, for a feature and for another functional alike. Inside
  a functional, files import each other with relative paths. There is no
  `functionals/index.ts`: each functional has its own public API and none hides
  behind a global barrel.
- **Layout.** There is no fixed layout. A small functional is flat: `slug/`,
  `page/` and `metadata-fields/` keep their files at the root. A large one adds
  subfolders where they help: `components/`, `hooks/`, `logic/` (pure functions,
  no React), `store/` (TanStack Store), `types/`. `filters/`, `table/`,
  `cel-editor/` and `step-stack/` do.
- **Tests and stories.** Tests live in `__tests__/` inside the functional; there
  is no `functionals/__tests__/` at the root. Stories live in `stories/`.
- **Size and principles.** The 350-line file limit is checked
  ([Checks](../AI_CONTEXT.md#checks)). Function length and the number of
  consumers a functional should have are principles, enforced by review only
  ([Principles](../AI_CONTEXT.md#principles)).

## Boundary with `domains/`

Sharing a module between features does not decide its layer. A module that carries
Kaiten vocabulary, an API schema or network calls belongs in `domains/`, however
many features use it.

### Counter-example: `crm-sync`

`domains/crm-sync/` looks like a functional: badges, a sync card and an error
dialog rendered by `customers`, `instances` and `connectors`. It carries:

- the connector name as the Attio worker registers it (`constants.ts`);
- a read model over an entity's integrations (`logic/attio-integration.ts`);
- network queries for the connector settings and the sync state (`queries/`).

That is business vocabulary and an API client, so it lives in `domains/`, the layer
for business code that several features share and that may use the API client.

A split, with the contracts in `domains/` and the widgets in `functionals/`, is not
possible: `functional-boundary` forbids `functionals/` from importing `domains/`.
The module moves whole or stays where it is.

`check:architecture` catches a functional that imports `@/api-client` or
`@/domains`. It cannot see an npm package that talks to the network, or business
slugs written as strings. Reviews check those.

### Example: `release-management`

`domains/release-management/components/` owns the shared business shell and its
internal tabs, consumed directly by releases, components and deployment zones.
URLs, translations and entity icon choices move together with that UI. The
generic `Page` and `RouteTabs` primitives remain in functionals; the domain owns
no route or page.

## The functionals

| Functional | What it is | Docs |
| --- | --- | --- |
| `cel-editor` | Monaco editor for CEL rules: highlighting, completion, syntax check, lint verdict, with a read-only rule view and a dialog | [README](../../src/functionals/cel-editor/README.md) |
| `code-editor` | Lazy-loaded Monaco wrapper that follows the app theme; `cel-editor` is built on it | |
| `detail-card` | `DetailCard`, the card of an entity detail page: header, action, title, rows | [detail-cards.md](../03-patterns/detail-cards.md) |
| `detail-entity-layout` | Composed detail shell: Top, Body, Tabs and scrollable Content; tab implementation is internal | [README](../../src/functionals/detail-entity-layout/README.md) |
| `filters` | Client-side filters: state hook and toolbar (pinned, quick-access, normal and advanced filters) | [README](../../src/functionals/filters/README.md) |
| `metadata-fields` | Turns JSON Schema metadata field descriptors into columns, filters and form inputs, with `DynamicForm` | [README](../../src/functionals/metadata-fields/README.md) |
| `page` | `Page` compound component for headers and layouts, and `EditableTitle` | [README](../../src/functionals/page/README.md) |
| `progress-stepper` | Numbered step strip and progress bar for full-page create wizards | |
| `risk-ranking-list-card` | Card that ranks items by a ratio with proportional bars, with loading and empty states | |
| `route-tabs` | Tab strip whose active tab follows the current route: by path prefix, and by search for tabs that share a path. It marks that tab, and only that one, with `aria-current` | |
| `slug` | `generateSlug(name)`: a slug in the alphabet the API accepts | |
| `stacked-form-dialog` | Form dialog shell: one panel, or stacked wizard cards on `step-stack`, with a prompt before unsaved changes are discarded | |
| `stat-card` | KPI card, alone or in a row whose labels, values and helpers line up | [stats-cards.md](../03-patterns/stats-cards.md) |
| `step-stack` | Multi-step navigation where earlier steps stack behind the active one | |
| `table` | `DataTable`, `FilterTableLayout`, `TableCard`, row actions and dialogs | [README](../../src/functionals/table/README.md) |

`ls app/src/functionals` is the authoritative list; keep this table in step with
it. The stories of a functional show its states: run `pnpm run storybook`, from
`app/`.

## Adding a functional

1. Check that it fits: a generic UI widget with real behaviour, and no Kaiten
   vocabulary, API schema or network client. Otherwise it belongs in `domains/`
   or in a feature.
2. Create `functionals/<name>/` and write its `index.ts` first, to settle the
   public API.
3. Add stories in `stories/` and unit tests in `__tests__/`.
4. For a large functional, add a `README.md` that documents its API.
5. Add a row to the table above.
6. Run `pnpm run check:architecture` and `pnpm run check:file-sizes`, then
   `pnpm run check:ci`, from `app/`.
