# Customers

A customer is one of the organization's end clients, and it owns instances. This feature lists customers, creates, edits and deletes them, and shows one customer with its details, its instances and, where billing is on, its billing e-mail and its invoices.

## Routes

| Path | Route file | What it renders |
| --- | --- | --- |
| `/customers` | `app/src/routes/customers/index.tsx` | `CustomersPageContent`: the customers table under a Customers / Instances tab bar |
| `/customers/new` | `app/src/routes/customers/new/index.tsx` | The same page with `CustomerFormDialog` open |
| `/customers/$customerSlug` | `app/src/routes/customers/$customerSlug/route.tsx` | `CustomerDetailPageContent`. With `?mode=configure` it opens `CustomerFormDialog` on the customer. With `?kaiten_setup_session=` (where Stripe sends the customer back to, once a payment method is saved there) the payment method card checks the session with the API and the route drops it from the address |
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
│   ├── customer-detail/                 # detail page: header, details card, payment method card (payment-method/), instances card, invoices card
│   ├── customer-detail-page-content.tsx # re-exports customer-detail/
│   ├── customer-form-dialog.tsx         # dialog around the form
│   ├── customer-form.tsx                # create and edit form
│   ├── customer-form-fields.tsx         # the fields
│   ├── customer-form.shared.ts          # Zod schema, form values <-> API bodies
│   ├── customer-form.mutations.ts       # create and update mutations
│   ├── __tests__/, stories/
│   └── index.ts
├── hooks/                               # use-customer-billing (what a customer screen offers of billing), use-payment-method (the writes on the payment method), use-setup-return (the session the customer comes back with)
├── schemas/                             # the currency a payment method is set up in
├── utils/provider-pages.ts              # where the customer comes back to, and the way to the pages Stripe hosts
├── queries/customer-query-options.ts    # customerQueryOptions
├── types/index.ts                       # Customer, CustomerLicenseType (from the domain)
└── index.ts
```

Read models, cache invalidation and the instance status and lifecycle badges that the customers and instances screens share live in `app/src/domains/customer-management/`.

## Data

Reads:

- **List.** `customersWithInstancesQueryOptions` (`@/domains/customer-management`) runs the GraphQL query `GetCustomersWithInstances` and walks every page (200 rows per request, `fetchAllPages`). Each row gets `nbInstances` and the distinct `licenseTypes` of its instances. Both `/customers` loaders prefetch it.
- **Detail.** `customerQueryOptions(customerSlug)` wraps the generated `getCustomerOptions` (`GET /customers/{customerSlug}`). The `$customerSlug` route ensures it in `beforeLoad`, which also sets the breadcrumb title to the customer's name.
- **Invoices of a customer.** `invoicesQueryOptions({ customerSlug })` (`@/domains/billing`, `GET /invoices?customerSlug=`), every page of them, 200 at a time. The API matches the slug the customer has now as well as the one an invoice was composed under, so a rename leaves the history in place. The card reads it with `useQuery`, not in the loader: a refusal of billing stays in the card.
- **Instances of a customer.** `useInstancesWithRelations()` (`@/domains/customer-management`, GraphQL `GetInstancesWithRelations`, every page) is filtered to the customer's slug on the client. Nothing prefetches it.

The list rows have the GraphQL shape (`Customer` in `app/src/features/customers/types/index.ts`). The detail page and the forms use the REST `Customer` type from `@/api-client`.

- **Payment method.** `customerBillingQueryOptions(customerSlug)` (`@/domains/billing`, `GET /customers/{customerSlug}/billing`), read by the payment method card where Stripe is connected and the session may read billing. It answers `providers: []` for a customer that has never been to Stripe, and `paymentMethod: null` for one with no card, though the contract declares the member always there (`getStripePaymentMethod` reads both).

Writes use the generated `createCustomerMutation`, `updateCustomerMutation` and `deleteCustomerMutation`, and, for the payment method, `createPaymentMethodSessionMutation`, `completePaymentMethodSessionMutation`, `createPortalSessionMutation` and `detachPaymentMethodMutation` (`usePaymentMethod`). None is optimistic.

Invalidation goes through `@/domains/customer-management`:

- After a create or an update, `invalidateCustomerQueries` invalidates the REST list key, the list above and, when it gets a slug, the customer's detail query.
- After a payment method is saved or removed, `invalidateCustomerBillingQueries` (`@/domains/billing`) refreshes what the customer holds in Stripe, and a 409 of a removal refreshes it too.
- After a delete, `forgetDeletedCustomerQueries` removes the detail query and invalidates the lists. The detail page navigates to `/customers` first and reconciles the cache afterwards: it observes the customer through `useSuspenseQuery`, so invalidating the detail query while it is mounted would refetch a customer the API has just deleted.

## Behaviour

- **Table.** Columns: name (sortable), external ID, domain, CRM sync, license types, instances and a delete action. The instances cell shows a count that opens a dialog listing them. The filters (name search, external ID, domain, license type) run on the client over the full list. A row opens the detail page, and "New Customer" goes to `/customers/new`. See [`functionals/table`](../../functionals/table/README.md) and [`functionals/filters`](../../functionals/filters/README.md).
- **Delete.** A customer that still has instances cannot be deleted. In the table the delete action becomes a disabled button that explains why. On the detail page the button is disabled while the customer has instances, with the same explanation, and while the instances are still loading. Both ask for confirmation. A delete from the detail page returns to `/customers`.
- **Billing e-mail.** Where the invoices of the customer are addressed, for the organization's accounting system; optional. It is a field of the form, a row of the details card ("Not set" when empty) and, where billing is off, none of these: billing is absent, not empty (`useCustomerBilling`). The form checks it as the API does (something before an `@`, something after it, no space, at most 254 bytes; `billingEmailSchema` in `@/domains/customer-management`) and trims it. A create sends it when there is one and leaves it out otherwise; an update sends what the form holds, so the address it was opened with is kept, and emptying the field sends an empty string, which the API reads as "remove" (omitting the member would keep it). A refusal of the API shows on the field in its own words.
- **Form.** Fields: name (required), slug, external customer ID, domain and, where billing is on, the billing e-mail. On creation the slug follows the name as the user types (`generateSlug`) and can be edited; an empty slug is left out of the request, and the API generates one. On edition the slug is locked and never sent. The domain follows the generated API schema and may be empty. A failed submit shows a toast with the API's message.
- **After a save.** A created customer opens on its detail page (the list if the response has no slug). An update closes the dialog and returns to the detail page.
- **Rename in place.** The detail header title is editable (`EditableTitle`); saving sends an update with the customer's current values and the new name.
- **Delete refused by billing.** A customer with a subscription that lives, or an invoice not settled, is kept: the API refuses (409 `DeleteCustomer.BillingActive`) and the console says which in a dialog (`useDeletionRefusal`, `DeletionRefusalDialog` from `@/domains/billing`) with a link to each invoice, in place of a toast. The page of the customer is where the person already is, so the dialog has no link to it.
- **Detail page.** The details card shows name, external ID, domain and, where billing is on, the billing e-mail, then the created and updated stamps with the actor's name. Where billing is on and the session may read invoices, an Invoices card follows the instances: the invoices of every instance of the customer, newest first, in the shared table, which sorts them and pages them ten to a page in the browser, an empty state when none was invoiced, and a refusal that stays in the card with a way to ask again. The instances card lists the customer's instances (name, license, license type, status, lifecycle stage, start and end dates); a row opens the instance, and "New Instance" opens `/customers/$customerSlug/instances/new`. Creating an instance there lands on the new instance.
- **Payment method.** Where Stripe is connected and the session may read billing, a card between the details and the instances shows the default payment method of the customer in Stripe as labels: the brand and the last four digits, the expiry and where it stands (active, soon to expire in the thirty days before the end of its expiry month, expired, or one a charge said can no longer be used, which asks for another). Kaiten never sees a card number. A customer that has never been to Stripe, or has no card, is told so, and that a contract that sends the invoice needs none. For a session that may write billing the card offers to add or replace a card, to manage it in the portal of Stripe, and to remove it. Adding or replacing asks the API for a page Stripe hosts (`POST .../billing/payment-method-session`) and sends the whole browser there, with the customer's page as the place to come back to; a customer that has no live subscription has no currency to set the card up in, the API says so (422 `CurrencyRequired`), and the person is asked for one in a dialog before going on. Back from Stripe, the address carries `kaiten_setup_session`; the card has the API check the session with Stripe and keep the labels (`POST .../complete`, never trusting the redirect), says the card is saved, and the route drops the session from the address, whichever way it ended, so that a reload does not ask again. What the customer holds is read only once the session is dealt with: a read made at the same time could be answered before the card was kept and, being the first, would be taken for the answer by the refresh that follows the check. A session the customer did not finish (409 `SessionNotComplete`) is said, with a button to check again; a session that may not write billing, or a Stripe that is not connected, only drops it. The portal (`POST .../portal-session`) is Stripe's page for what the customer manages there, and also leads back here. A Stripe that cannot be reached for either (503) changed nothing, which the card says, with a Retry that sends the request again, in the currency it was asked in; any other refusal is shown in the API's words, with the way to the Stripe connector where it is mended there. Removing a card asks first, and is refused while a live contract of the customer is charged automatically (409 `InUseByAutomaticCollection`): the dialog stays open on the API's words and says to switch those contracts to sending the invoice, in the Billing tab of their instance, first. A link leads to the customer in the dashboard of Stripe when the API gives an https address.
- **CRM sync.** The table shows a CRM sync badge per row (`IntegrationSyncBadge`). After a create or an update, the form mutations start `startAttioSyncWatcher` (`@/domains/crm-sync`), which polls until the customer's Attio data appears or changes. The detail page shows `AttioSyncCard` next to the details card only when the customer has Attio sync data or a sync is being watched. Setting up the connector is the [`connectors`](../connectors/README.md) feature.

## Tests

- Unit and component tests (Vitest): `app/src/features/customers/components/__tests__/` (`customer-form.shared.test.ts`, `customer-form.test.tsx`, `customer-form-dialog.test.tsx`, `customer-detail-page-content.test.tsx`, `customer-billing.test.tsx` and `payment-method-card.test.tsx`: the card in each state, saving a card and the currency, the portal, the removal and its refusal, and the return from Stripe) and `app/src/features/customers/components/customer-form.mutations.test.tsx`. The routes carry two more: `app/src/routes/customers/$customerSlug/-edit.test.ts` and `app/src/routes/customers/$customerSlug/instances/new/-index.test.tsx`. The domain has its own under `app/src/domains/customer-management/`.
- Stories: `app/src/features/customers/components/stories/` (`Features/Customers/CustomerTable`, `CustomerDetailPageContent`, `CustomerFormDialog`, and `Features/Customers/Billing`: the billing e-mail of the details card set, not set and absent where billing is off, and the card of invoices with some and with none; `Features/Customers/PaymentMethod`: the card active, soon to expire, expired, failed and absent, and a removal that is refused). The visual regression suite (`app/e2e/tests/visual-regression.spec.ts`) compares the `CustomerTable` stories `default` and `empty`.
- E2E: `app/e2e/app/customers/` holds the `read`, `create`, `update`, `delete`, `errors`, `fuzz`, `attio-sync`, `billing` (the e-mail and the invoices) and `delete-refusal` specs (`customers.<name>.spec.ts`) and their data, `customers.scenarios.ts`. Other specs open the pages too: `app/e2e/app/accessibility/accessibility.spec.ts` runs WCAG checks on the list, `app/e2e/app/mobile/mobile.read.spec.ts` opens the list on a phone-sized viewport, and `app/e2e/app/instances/instances.create.spec.ts` creates an instance from the customer-scoped dialog with the customer locked.

## Public API

`app/src/features/customers/index.ts` exports `CustomersPageContent`, `CustomerDetailPageContent`, `CustomerFormDialog` and `customerQueryOptions`. Only the routes under `app/src/routes/customers/` import them, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). The other components are internal to the feature.

The feature uses `@/domains/billing` for the invoices card, the gate and the dialog that explains a refusal to delete. What the `instances` feature needs about customers comes from `@/domains/customer-management`, or from its own code: it defines its own `customerQueryOptions` for the instance detail page.
