# Components

`app/src/components/` holds the generic UI of the console: the primitives, the form system, the dialog shells and a few small shared components. It carries no business vocabulary and no API client. The [layers](../AI_CONTEXT.md#layers) say where a new component goes (generic UI here, generic UI with real logic in a functional, business UI in a domain or a feature), and `pnpm run check:architecture` refuses a `components/` file that imports `api-client/`, `domains/`, `features/`, `functionals/` or `routes/` ([import rules](../AI_CONTEXT.md#import-rules)).

The folder is the inventory. These pages group what it holds by use, so you can find the component that exists before you write another one, and link to its Storybook story.

## What is in `components/`

| Path | Holds | Read |
| --- | --- | --- |
| `ui/` | The primitives: buttons, inputs, overlays, cards, tabs, tables, charts | [UI components](./ui-components.md) |
| `form/` | The fields and building blocks of `useAppForm`, and the submit button | [Form components](./form-components.md) |
| `dialog/` | Dialog shells: `FormDialog`, `DeleteConfirmationDialog`, `DialogFormSkeleton` | [Dialogs](#dialogs) |
| `route/` | `RouteError`, `RoutePending` and `NotFound`, the router's default components, and `RestrictedAccess`, which `RouteError` renders for a refused read | [Route components](#route-components) |
| `combobox.tsx`, `date-picker.tsx`, `date-range-picker.tsx` | Inputs that compose primitives, used by the form fields | [Form components](./form-components.md#pickers) |
| `gradient-button.tsx`, `destructive-action-button.tsx`, `choice-button.tsx`, `chart-empty-state.tsx`, `company-icons.tsx` | Small shared components | [UI components](./ui-components.md#shared-components-outside-ui) |
| `theme-provider.tsx`, `clerk-provider.tsx`, `dev-auth-switcher.tsx` | App wiring mounted from `app/src/main.tsx` (and `dev-auth-switcher.tsx` from `app/src/routes/__root.tsx`), not reusable UI | |

The table components are not here: they live in the `table` functional, see [Table components](./table-components.md).

## Dialogs

`app/src/components/dialog/` builds on the `Dialog` and `AlertDialog` primitives of `ui/`.

| Component | Use | Story |
| --- | --- | --- |
| `FormDialog` | The shell of a form in a dialog. A root with named parts: `FormDialog.Header`, `.Title`, `.Description`, `.Content` and `.Footer`. The header and footer stay fixed and only the content scrolls. `.Content` shows a `DialogFormSkeleton` while a lazy form loads. | [`form-dialog.stories.tsx`](../../src/components/dialog/stories/form-dialog.stories.tsx) |
| `DeleteConfirmationDialog` | A confirmation dialog, built on `AlertDialog`, around any trigger you pass in. `TableDeleteDialog` and `DestructiveActionButton` are built on it. | [`delete-confirmation-dialog.stories.tsx`](../../src/components/dialog/stories/delete-confirmation-dialog.stories.tsx) |
| `DialogFormSkeleton`, `DialogFormSkeletonCard` | Field-shaped and card-shaped placeholders for the time a dialog form loads. | [`dialog-form-skeleton.stories.tsx`](../../src/components/dialog/stories/dialog-form-skeleton.stories.tsx) |

The shell of the create and edit dialogs of the entities (customers, instances, entitlements, deployment zones, components) is not in this folder: it is `StackedFormDialog`, a functional, described in [functionals](../01-architecture/functionals.md) and [the dialog shell](../03-patterns/dialog-via-route.md#the-dialog-shell). Those dialogs open from a route: see [dialog via route](../03-patterns/dialog-via-route.md).

`FormDialog` shells other forms, for example `app/src/features/feature-flags/targeting/components/targeting-form-dialog.tsx`, `app/src/features/webhooks/components/webhook-list/create-webhook-dialog.tsx` and `app/src/features/connectors/attio/components/attio-mapping-editor-dialog.tsx`. Smaller action and secondary dialogs are written directly with the `Dialog` primitives and `DialogContent variant="form"`, as `app/src/features/licenses/components/entitlements/add-entitlement-dialog.tsx` does.

## Route components

`app/src/main.tsx` registers `RouteError`, `NotFound` and `RoutePending` as the router's default error, not-found and pending components. A route file imports `RoutePending` when it sets its own `pendingComponent`, as `app/src/routes/customers/route.tsx` does. `RouteError` shows a "Something went wrong" card with a retry button and a way home. It renders `NotFound` instead when the API says the entity does not exist (a 404), and `RestrictedAccess` when the API refuses the read (a 403): see [where the error is shown](../02-conventions/error-handling.md#where-the-error-is-shown). Stories: [`route-error.stories.tsx`](../../src/components/route/stories/route-error.stories.tsx) and [`route-pending.stories.tsx`](../../src/components/route/stories/route-pending.stories.tsx).

## Storybook

Stories sit in a `stories/` folder next to the components they show, and their titles start with `Components/`. Run `pnpm run storybook` from `app/` to browse them, and `pnpm run test:stories` to run them as tests. Every story file of `app/src/components/` carries the `autodocs` tag, so Storybook builds a Docs page with the component's props: read the props there, not in these pages, which do not copy them.

## Adding a component

- Look for it in these pages and in the folder first.
- A primitive that comes from shadcn/ui or wraps Base UI goes in `ui/`: see [UI components](./ui-components.md).
- A new form field goes in `form/fields/`: see [Form components](./form-components.md#adding-a-field).
- Give a shared component a story when it has states worth seeing, and add the keys of any text it shows to both locales: see [i18n](../02-conventions/i18n.md).
