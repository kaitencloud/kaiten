import { z } from 'zod';

/**
 * What the URL of the list of invoices holds: the customer or the instance whose
 * invoices it lists, and nothing else. The API applies it, because it matches the
 * slug a customer or an instance has now as well as the one an invoice was
 * composed under, which a text match on the rows cannot do; every other filter of
 * the list is the screen's, in the browser. A link is not an API call: what does not
 * read as a slug is dropped, field by field, and the page opens with the rest.
 */
const slug = z.string().trim().min(1).max(200).optional().catch(undefined);

const invoiceScopeSchema = z.object({
  customerSlug: slug,
  instanceSlug: slug,
});

/** The scope that is set: a slug that is not is not there. */
export type InvoiceScope = z.output<typeof invoiceScopeSchema>;

/** What the URL carries of the scope: the slugs that read as one, so that none leaves the bare path. */
export function readInvoiceScope(
  search: Record<string, unknown>,
): InvoiceScope {
  return invoiceScopeSchema.parse(search);
}
