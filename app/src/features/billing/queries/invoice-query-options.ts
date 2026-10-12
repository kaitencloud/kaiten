import { queryOptions } from '@tanstack/react-query';
import { getInvoiceOptions } from '@/api-client/@tanstack/react-query.gen';

/** One invoice, with its lines, its hold and its handoff. */
export const invoiceQueryOptions = (invoiceId: string) =>
  queryOptions({
    ...getInvoiceOptions({ path: { invoiceId } }),
    retry: false,
  });
