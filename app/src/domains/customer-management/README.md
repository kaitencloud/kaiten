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
