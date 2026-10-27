# Customer management

Shared customer/instance read models, status/lifecycle presentation and queries,
consumed by customers, instances, connectors and CRM sync. The explicit domain
entry point exposes named values and types; the generated API remains the contract
source. Query invalidation helpers cover REST detail/list and GraphQL projections.
Pages and route-level composition belong to the consuming features.

The billing e-mail of a customer is checked here as the API checks it
(`billingEmailSchema`, `isValidBillingEmail`), and `customerBillingEmailToUpdateBody`
builds the update that sets it alone, so that the customers screens and the dialog
that subscribes an instance (`features/instances`) agree on what a valid address is
and on how it is sent: the update restates the customer, an empty string removes the
address, and leaving the member out keeps it.

Every update of a customer goes through `saveCustomerOnFresh`: the PUT takes the
customer as a whole, so the customer is read again first and only what the form
changed (`edited` against `opened`, both built from `customerToUpdateBody` or the
form's own body) is applied on top of it. See
[forms](../../../docs/03-patterns/forms.md#updating-an-object-the-api-replaces-as-a-whole).

The row of tabs above the pages of the Customers section (the customers, their
instances and, where it is offered, the checkouts) is written once, in
`useCustomersSectionTabs`, because the three pages of the section draw it. Whether
the checkouts are offered is billing's to say (`useCheckoutSessionsOffered` of
`@/domains/billing`): the page passes the answer in, so that this domain does not
import billing, which imports it.
