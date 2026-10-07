import { z } from 'zod';
import { zListInvoicesQuery } from '@/api-client/zod.gen';

/**
 * The filters of the list of invoices, as the URL holds them and as the API takes
 * them: the same names, the same values. The schema starts from the one the API
 * generates, so a status or a kind the API adds is accepted here the day the client
 * is generated. A link is not an API call: what does not read as a filter is
 * dropped, field by field, and the page opens with the rest, where a bad value
 * would otherwise fail the whole page.
 */
const api = zListInvoicesQuery.shape;

// `?status=PAID` and `?status=["PAID","MANUAL"]` both name statuses.
const asList = (value: unknown) =>
  typeof value === 'string' ? [value] : value;

// Only "yes" filters: a boolean the API reads as "only these", and an
// `overdue=false` is no filter at all.
const onlyTrue = z
  .boolean()
  .optional()
  .catch(undefined)
  .transform((value) => (value ? true : undefined));

const slug = z.string().trim().min(1).max(200).optional().catch(undefined);

export const invoiceFiltersSchema = z.object({
  boundaryFrom: api.boundaryFrom.catch(undefined),
  boundaryTo: api.boundaryTo.catch(undefined),
  customerSlug: slug,
  handoffStatus: api.handoffStatus.catch(undefined),
  held: onlyTrue,
  instanceSlug: slug,
  issuedFrom: api.issuedFrom.catch(undefined),
  issuedTo: api.issuedTo.catch(undefined),
  kind: api.kind.catch(undefined),
  overdue: onlyTrue,
  providerKind: api.providerKind.catch(undefined),
  status: z
    .preprocess(asList, api.status)
    .catch(undefined)
    .transform((statuses) =>
      statuses && statuses.length > 0 ? statuses : undefined,
    ),
});

/** The filters that are set: a filter that is not is not there. */
export type InvoiceFilters = Partial<z.output<typeof invoiceFiltersSchema>>;

/** What the URL carries of the filters: set ones only, so that none leaves the bare path. */
export function readInvoiceFilters(
  search: Record<string, unknown>,
): InvoiceFilters {
  return invoiceFiltersSchema.parse(search);
}
