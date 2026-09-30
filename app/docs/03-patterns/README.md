# Patterns

The patterns the console reuses. The rules they follow (layers, import rules, principles) are stated once in [AI_CONTEXT.md](../AI_CONTEXT.md); these pages show how to apply them.

## Structure

| Page | What it covers |
| --- | --- |
| [Routes as assemblers](./routes-as-assemblers.md) | What a route file contains and what stays in the feature: loaders, search params, layout routes, errors |
| [Dialog via route](./dialog-via-route.md) | Dialogs that have their own URL, and the `?mode=configure` edit mode of a detail page |
| [State management](./state-management.md) | Where each kind of state lives: server state, feature UI state, URL, local state, persisted settings |
| [Composition](./composition.md) | Shared components with a root and named sub-components instead of long prop lists |

## Screens

| Page | What it covers |
| --- | --- |
| [Forms](./forms.md) | TanStack Form and Zod: schemas, create and edit modes |
| [Tables](./tables.md) | Data tables, columns and row actions |
| [Page scrolling](./page-scrolling.md) | `Page layout="scroll"`: a fixed header, a scrolling body, the scrollbar at the page edge |
| [Detail cards](./detail-cards.md) | Layout of the cards on an entity detail page |
| [Stats cards](./stats-cards.md) | The row of KPI cards under a page header |

Feature-specific behaviour is documented with the feature, in `app/src/features/<name>/README.md`. The [features table](../04-features/README.md) lists them.
