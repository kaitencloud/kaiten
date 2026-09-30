# Customers

A customer is one of the organization's end clients, and it owns instances. This feature lists customers, creates, edits and deletes them, and shows one customer with its details and its instances.

## Routes

| Path | Route file | What it renders |
| --- | --- | --- |
| `/customers` | `app/src/routes/customers/index.tsx` | `CustomersPageContent`: the customers table under a Customers / Instances tab bar |
| `/customers/new` | `app/src/routes/customers/new/index.tsx` | The same page with `CustomerFormDialog` open |
| `/customers/$customerSlug` | `app/src/routes/customers/$customerSlug/route.tsx` | `CustomerDetailPageContent`. With `?mode=configure` it opens `CustomerFormDialog` on the customer |
| `/customers/$customerSlug/edit` | `app/src/routes/customers/$customerSlug/edit.tsx` | Redirects to `/customers/$customerSlug?mode=configure` |
| `/customers/$customerSlug/instances/new` | `app/src/routes/customers/$customerSlug/instances/new/index.tsx` | `InstanceFormDialog` from the `instances` feature, over the detail page, with the customer locked |

`app/src/routes/customers/route.tsx` is the layout of the whole `/customers` section: it loads the customers list and renders the outlet. The Instances tab and every `/customers/instances/**` route belong to the `instances` feature.

`/customers` is the second entry of the side navigation (`topLevelRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`). The dialogs follow [dialog via route](../../../docs/03-patterns/dialog-via-route.md).

## Structure

```txt
app/src/features/customers/
├── components/
│   ├── customers-page-content.tsx       # list page: header, tabs, table
│   ├── customer-table.tsx               # table, filters, "New Customer" button
│   ├── customer-table-actions.tsx       # delete action of a row
│   ├── customer-instances-display.tsx   # instance count that opens the list of instances
│   ├── customer-detail/                 # detail page: header, details card, instances card
│   ├── customer-detail-page-content.tsx # re-exports customer-detail/
│   ├── customer-form-dialog.tsx         # dialog around the form
│   ├── customer-form.tsx                # create and edit form
│   ├── customer-form-fields.tsx         # the fields
│   ├── customer-form.shared.ts          # Zod schema, form values <-> API bodies
│   ├── customer-form.mutations.ts       # create and update mutations
│   ├── __tests__/, stories/
│   └── index.ts
├── queries/customer-query-options.ts    # customerQueryOptions
├── types/index.ts                       # Customer, CustomerLicenseType (from the domain)
└── index.ts
```

Read models, cache invalidation and the instance status and lifecycle badges that the customers and instances screens share live in `app/src/domains/customer-management/`.

## Data

Reads:

- **List.** `customersWithInstancesQueryOptions` (`@/domains/customer-management`) runs the GraphQL query `GetCustomersWithInstances` and walks every page (200 rows per request, `fetchAllPages`). Each row gets `nbInstances` and the distinct `licenseTypes` of its instances. Both `/customers` loaders prefetch it.
- **Detail.** `customerQueryOptions(customerSlug)` wraps the generated `getCustomerOptions` (`GET /customers/{customerSlug}`). The `$customerSlug` route ensures it in `beforeLoad`, which also sets the breadcrumb title to the customer's name.
- **Instances of a customer.** `useInstancesWithRelations()` (`@/domains/customer-management`, GraphQL `GetInstancesWithRelations`, every page) is filtered to the customer's slug on the client. Nothing prefetches it.

The list rows have the GraphQL shape (`Customer` in `app/src/features/customers/types/index.ts`). The detail page and the forms use the REST `Customer` type from `@/api-client`.

Writes use the generated `createCustomerMutation`, `updateCustomerMutation` and `deleteCustomerMutation`.

Invalidation goes through `@/domains/customer-management`:

- After a create or an update, `invalidateCustomerQueries` invalidates the REST list key, the list above and, when it gets a slug, the customer's detail query.
- After a delete, `forgetDeletedCustomerQueries` removes the detail query and invalidates the lists. The detail page navigates to `/customers` first and reconciles the cache afterwards: it observes the customer through `useSuspenseQuery`, so invalidating the detail query while it is mounted would refetch a customer the API has just deleted.

## Behaviour

- **Table.** Columns: name (sortable), external ID, domain, CRM sync, license types, instances and a delete action. The instances cell shows a count that opens a dialog listing them. The filters (name search, external ID, domain, license type) run on the client over the full list. A row opens the detail page, and "New Customer" goes to `/customers/new`. See [`functionals/table`](../../functionals/table/README.md) and [`functionals/filters`](../../functionals/filters/README.md).
- **Delete.** A customer that still has instances cannot be deleted. In the table the delete action becomes a disabled button that explains why. On the detail page the button is disabled while the customer has instances, with the same explanation, and while the instances are still loading. Both ask for confirmation. A delete from the detail page returns to `/customers`.
- **Form.** Fields: name (required), slug, external customer ID and domain. On creation the slug follows the name as the user types (`generateSlug`) and can be edited; an empty slug is left out of the request, and the API generates one. On edition the slug is locked and never sent. The domain follows the generated API schema and may be empty. A failed submit shows a toast with the API's message.
- **After a save.** A created customer opens on its detail page (the list if the response has no slug). An update closes the dialog and returns to the detail page.
- **Rename in place.** The detail header title is editable (`EditableTitle`); saving sends an update with the customer's current values and the new name.
- **Detail page.** The details card shows name, external ID and domain, then the created and updated stamps with the actor's name. The instances card lists the customer's instances (name, license, license type, status, lifecycle stage, start and end dates); a row opens the instance, and "New Instance" opens `/customers/$customerSlug/instances/new`. Creating an instance there lands on the new instance.
- **CRM sync.** The table shows a CRM sync badge per row (`IntegrationSyncBadge`). After a create or an update, the form mutations start `startAttioSyncWatcher` (`@/domains/crm-sync`), which polls until the customer's Attio data appears or changes. The detail page shows `AttioSyncCard` next to the details card only when the customer has Attio sync data or a sync is being watched. Setting up the connector is the [`connectors`](../connectors/README.md) feature.

## Tests

- Unit and component tests (Vitest): `app/src/features/customers/components/__tests__/` (`customer-form.shared.test.ts`, `customer-form.test.tsx`, `customer-form-dialog.test.tsx`, `customer-detail-page-content.test.tsx`) and `app/src/features/customers/components/customer-form.mutations.test.tsx`. The routes carry two more: `app/src/routes/customers/$customerSlug/-edit.test.ts` and `app/src/routes/customers/$customerSlug/instances/new/-index.test.tsx`. The domain has its own under `app/src/domains/customer-management/`.
- Stories: `app/src/features/customers/components/stories/` (`Features/Customers/CustomerTable`, `CustomerDetailPageContent`, `CustomerFormDialog`). The visual regression suite (`app/e2e/tests/visual-regression.spec.ts`) compares the `CustomerTable` stories `default` and `empty`.
- E2E: `app/e2e/app/customers/` holds the `read`, `create`, `update`, `delete`, `errors`, `fuzz` and `attio-sync` specs (`customers.<name>.spec.ts`) and their data, `customers.scenarios.ts`. Other specs open the pages too: `app/e2e/app/accessibility/accessibility.spec.ts` runs WCAG checks on the list, `app/e2e/app/mobile/mobile.read.spec.ts` opens the list on a phone-sized viewport, and `app/e2e/app/instances/instances.create.spec.ts` creates an instance from the customer-scoped dialog with the customer locked.

## Public API

`app/src/features/customers/index.ts` exports `CustomersPageContent`, `CustomerDetailPageContent`, `CustomerFormDialog` and `customerQueryOptions`. Only the routes under `app/src/routes/customers/` import them, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). The other components are internal to the feature.

What the `instances` feature needs about customers comes from `@/domains/customer-management`, or from its own code: it defines its own `customerQueryOptions` for the instance detail page.
