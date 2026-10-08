# Dialog via route

A create or edit dialog can have its own URL. `/customers/new` shows the customers page with the creation dialog open, and closing the dialog navigates back to `/customers`. A route renders the dialog; no `useState` decides whether it is open.

- The URL can be shared and bookmarked, and the back button closes the dialog.
- When the route tree loads the page data before the dialog route renders (see [Where the dialog route sits](#where-the-dialog-route-sits)), the page under the dialog has no loading state: its data is already in the TanStack Query cache.
- Create and edit dialogs work the same way.

The convention that a small create or edit form gets a route-driven dialog is in [AI_CONTEXT.md](../AI_CONTEXT.md#conventions). This page says how to build one.

## Dialog or full page

Decide this first.

A dialog route fits when:

- the task is short, focused and self-contained;
- the user gains from keeping the page underneath (its scroll, its filters, its selection);
- closing should lead back to the list or the detail page it came from;
- the flow needs no heavy tabs, wizard or secondary navigation.

A full page fits when:

- the flow has several steps, is long, or needs several areas of information;
- the user often compares, copies or consults data outside the form;
- the content needs a rich layout (cards, local tabs, sub-dialogs, inline editing);
- the screen has to live on its own, with its own context.

If a dialog only works by stacking tabs, a wizard or nested dialogs, it is a page.

In the code, `/customers/new`, `/integrations/service-accounts/new`, `/releases/deployment-zones/$zoneSlug/edit` and the four dialogs of a subscription, `/customers/instances/$instanceSlug/billing/subscribe`, `/cancel`, `/plan-change` and `/terms`, are dialog routes. The last four stand over a tab: the layout route (`billing/route.tsx`) draws the Billing tab and renders the `Outlet`, so that the tab stays where it was behind the dialog, and the `index` route beside it renders nothing. `/releases/new` (a multi-step form), `/feature-flags/new`, `/entitlements/new` and `/licenses/new` are full pages.

## A dialog route

The component renders the dialog, always open. Its `onOpenChange` navigates back when the dialog closes.

```tsx
// app/src/routes/releases/deployment-zones/new/index.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { DeploymentZoneFormDialog } from '@/features/deployment-zones';

export const Route = createFileRoute('/releases/deployment-zones/new/')({
  component: NewDeploymentZoneDialog,
  pendingComponent: () => null,
});

function NewDeploymentZoneDialog() {
  const navigate = useNavigate();
  const backToList = () => {
    navigate({ to: '/releases/deployment-zones' });
  };

  return (
    <DeploymentZoneFormDialog
      open
      onSuccess={backToList}
      onOpenChange={(open) => {
        if (!open) {
          backToList();
        }
      }}
    />
  );
}
```

An edit dialog needs its entity. `beforeLoad` reads it from the cache (or loads it), turns a missing entity into a not-found page and puts it in the route context:

```tsx
// app/src/routes/releases/deployment-zones/$zoneSlug/edit.tsx (abridged)
export const Route = createFileRoute(
  '/releases/deployment-zones/$zoneSlug/edit',
)({
  component: EditDeploymentZoneDialog,
  pendingComponent: () => null,
  beforeLoad: async ({ context, params: { zoneSlug } }) => {
    const zones = await context.queryClient.ensureQueryData(
      deploymentZonesQueryOptions,
    );
    const zone = zones?.items.find((z) => z.slug === zoneSlug);

    if (!zone) {
      throw notFound();
    }

    return { deploymentZone: zone, getTitle: () => zone.name };
  },
});

function EditDeploymentZoneDialog() {
  const { deploymentZone } = Route.useRouteContext();
  // …renders <DeploymentZoneFormDialog deploymentZone={deploymentZone} open … />
}
```

## Where the dialog route sits

The dialog is drawn over a page. What draws that page depends on the route tree.

### The layout route renders the page

When the parent path has a single page, its layout route (`route.tsx`) renders the page and an `<Outlet />`. The dialog routes below it render only the dialog, and the page stays mounted underneath.

```txt
routes/releases/deployment-zones/
├── route.tsx               # loader, DeploymentZonesPageContent around <Outlet />
├── new/index.tsx           # dialog only
├── $zoneSlug/edit.tsx      # dialog only
└── $zoneSlug/deploy.tsx    # dialog only
```

```tsx
// app/src/routes/releases/deployment-zones/route.tsx (abridged)
function DeploymentZonesLayout() {
  return (
    <DeploymentZonesPageContent>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </DeploymentZonesPageContent>
  );
}
```

`app/src/routes/releases/components/` is built the same way. The detail page of a zone is in `deployment-zones_/$zoneSlug/`: the trailing underscore keeps that route out of the `deployment-zones` layout, so the detail page is not drawn inside the list page.

### The dialog route renders the page

When the parent path has several pages, its layout cannot render one of them around the others. `/customers` has two: the customers page and, under `/customers/instances`, the instances page. The layout route only loads data and renders the `Outlet`. Each page route renders its page, and a dialog route renders the same page again with the dialog as its `children`.

```txt
routes/customers/
├── route.tsx                    # loader, <Suspense><Outlet /></Suspense>
├── index.tsx                    # CustomersPageContent
├── new/index.tsx                # CustomersPageContent + the creation dialog
├── instances/
│   ├── route.tsx                # <Suspense><Outlet /></Suspense>
│   ├── index.tsx                # InstancesPageContent
│   └── new/index.tsx            # InstancesPageContent + the creation dialog
└── $customerSlug/…              # detail page, see below
```

```tsx
// app/src/routes/customers/new/index.tsx (abridged)
function NewCustomerRoute() {
  const navigate = useNavigate();
  const backToList = () => {
    navigate({ to: '/customers' });
  };
  // Land on the customer that was just created.
  const openCreatedCustomer = (customer: Customer) => {
    // …navigate to '/customers/$customerSlug'
  };

  return (
    <CustomersPageContent>
      <CustomerFormDialog
        open
        onSuccess={openCreatedCustomer}
        onOpenChange={(open) => {
          if (!open) {
            backToList();
          }
        }}
      />
    </CustomersPageContent>
  );
}
```

`CustomersPageContent` renders its `children` after the page. The layout loader has already put the customers in the cache, so the page renders without a loading state. `app/src/routes/integrations/service-accounts/` follows this shape too: its layout loader loads the service accounts.

The instances page has the same route shape but is not preloaded. `/customers/instances` has no loader, and `InstancesPageContent` reads its data with `useInstancesWithRelations`, a plain `useQuery` under its own key. Opening `/customers/instances/new` directly renders the page with an empty table until the data arrives.

### A detail page and a child dialog

A detail page is a layout route that loads the entity and renders the detail page around an `<Outlet />`. A child route opens a dialog over it and reads the entity from the cache the parent has warmed. Closing the dialog navigates to the parent's detail route.

```txt
routes/customers/$customerSlug/
├── route.tsx                    # detail page, ?mode=configure dialog, <Suspense><Outlet /></Suspense>
├── index.tsx                    # empty index route
├── edit.tsx                     # redirect to ?mode=configure
└── instances/new/index.tsx      # dialog route
```

`app/src/routes/releases/$releaseSlug/deploy.tsx` is another child dialog of a detail page.

## The `?mode=configure` edit mode

Editing an entity from its detail page does not need a route of its own. The detail layout route validates a `mode` search parameter and shows the edit form while it is `configure`:

```tsx
// app/src/routes/customers/$customerSlug/route.tsx (abridged)
const customerDetailSearchSchema = z
  .object({
    mode: z.enum(['configure']).optional(),
  })
  .loose();

export const Route = createFileRoute('/customers/$customerSlug')({
  component: CustomerDetailRouteLayout,
  validateSearch: (search) => customerDetailSearchSchema.parse(search),
  // beforeLoad and loader: ensureQueryData(customerQueryOptions(customerSlug))
});

function CustomerDetailRouteLayout() {
  const navigate = useNavigate();
  const { customerSlug } = Route.useParams();
  const search = Route.useSearch();
  const { data: customer } = useSuspenseQuery(
    customerQueryOptions(customerSlug),
  );

  const closeConfigure = () => {
    navigate({ to: '/customers/$customerSlug', params: { customerSlug } });
  };

  return (
    <CustomerDetailPageContent customerSlug={customerSlug}>
      {search.mode === 'configure' ? (
        <CustomerFormDialog
          open
          customer={customer}
          onSuccess={closeConfigure}
          onOpenChange={(open) => {
            if (!open) {
              closeConfigure();
            }
          }}
        />
      ) : null}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </CustomerDetailPageContent>
  );
}
```

- **Opening.** The Edit button is a link to the detail route with `search={{ mode: 'configure' }}` (`app/src/features/customers/components/customer-detail/customer-detail-header.tsx`).
- **Closing.** The form navigates to the detail route without a `search`, which drops every search parameter, `mode` included.
- **Any tab.** The form belongs to the layout route, so it opens over whichever tab route is active.
- **Other search parameters.** `.loose()` keeps the keys the schema does not name instead of stripping them (a plain `z.object` drops them), so the parsed search still carries any other parameter of the URL.
- **Old URLs.** `/customers/$customerSlug/edit` and `/customers/instances/$instanceSlug/edit` redirect to the detail route with `mode: 'configure'`, keeping the other search parameters (`app/src/routes/customers/$customerSlug/edit.tsx`).
- **Where it is used.** Customers, instances and entitlements show a dialog. The feature flag route shows `FeatureFlagConfigurePage`, a full-page form that replaces the detail page while `mode` is `configure`. A license version shows `LicenseCommercialDialog`, which edits how it is sold and nothing else (the console does not edit the rest of a version); its layout route drops only `mode` on close (`search: (previous) => ({ ...previous, mode: undefined })`, `to: '.'`), since a tab of the version has search of its own.

A nested entity can open from a search parameter of its tab in the same way, in a drawer: the Prices tab of a license version opens the drawer of a price from `?price=new` and `?price=<id>`. The tab reads the parameter, so a link can open it and the back button closes it; a link that cannot open it (an unknown id, a published version) is replaced by the tab, once what decides it is known.

## Avoiding a flash

| Element | Purpose |
| --- | --- |
| `pendingComponent: () => null` on a dialog route | The router shows its default pending component (`RoutePending`, set in `app/src/main.tsx`) in place of a route that loads slowly. A dialog route shows nothing instead. |
| `<Suspense fallback={null}>` around the `<Outlet />` | A dialog that suspends, for example while it reads a query, does not trigger a fallback higher up that would blank the page. |
| `ensureQueryData` in the layout route's `loader` | The page data is loaded before the first render. A query already in the cache returns at once. |
| `useSuspenseQuery` in the components | Reads from the cache, with no request when the data is there. |

## The dialog shell

`StackedFormDialog` (`app/src/functionals/stacked-form-dialog/`) is the shell of the create and edit dialogs. It renders a title, a scrolling body that shows a skeleton while its content suspends, and a footer. The form puts its buttons in the footer with `StackedFormDialogFooter`. Closing with unsaved changes asks for confirmation (`confirmOnClose`, on by default). A form can tell the dialog it has no changes with `StackedFormDialogDirtyState`, and the simple create and edit dialogs pass `confirmOnClose={false}`. With `stacked`, the dialog becomes the stage of a multi-step form.

```tsx
// app/src/features/customers/components/customer-form-dialog.tsx (abridged)
export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSuccess,
}: CustomerFormDialogProps) {
  const { t } = useTranslation();

  return (
    <StackedFormDialog
      confirmOnClose={false}
      open={open}
      onOpenChange={onOpenChange}
      title={
        customer
          ? t('Pages.Customers.Mutation.titleUpdate')
          : t('Pages.Customers.Mutation.titleNew')
      }
    >
      <CustomerForm
        customer={customer}
        onCancel={() => onOpenChange(false)}
        onSuccess={onSuccess ?? (() => onOpenChange(false))}
      />
    </StackedFormDialog>
  );
}
```

`FormDialog` (`app/src/components/dialog/`) is a compound shell for compact or specialised dialogs that do not need the stacked one.

### The form's `onSuccess`

The form takes an optional `onSuccess` callback. The dialog passes one, and the route decides where to go next: `customers/new` lands on the customer it created, `deployment-zones/new` returns to the list. Without a callback the form navigates to the list itself.

```tsx
// app/src/features/customers/components/customer-form.tsx (abridged)
function handleSuccess(savedCustomer: Customer) {
  if (onSuccess) {
    onSuccess(savedCustomer);
    return;
  }

  backToList();
}
```

## When local state is enough

A dialog that is not the main action of a screen can use local state: a delete confirmation (`TableDeleteDialog`) or a dialog that edits one item of a list held by a form that is submitted as a whole, such as the targeting rule dialog inside the feature flag form (`app/src/features/feature-flags/targeting/components/use-targeting-list-controller.ts`). So can a confirmation of an action on the entity of a page that is not an edit of it: it asks for a reason or a reference and sends it, and what it changes shows on the page behind it. The deprecation of a price (`app/src/features/licenses/components/prices/deprecate-price-dialog.tsx`) and the audited actions of an invoice (release, mark paid, write off, void, recompose, acknowledge; `app/src/features/billing/components/invoice-detail/` and `.../handoff/`) are these. Some create dialogs also open from local state, for example the webhook creation dialog (`app/src/features/webhooks/components/webhook-list/webhook-list.controller.ts`). A new create or edit dialog for an entity gets a route.
