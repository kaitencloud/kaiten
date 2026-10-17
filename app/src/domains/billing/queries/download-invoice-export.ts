import { exportInvoices } from '@/api-client';
import { downloadBlob } from '@/lib/download-blob';
import {
  type InvoiceExportFilters,
  type InvoiceExportVariant,
  invoiceExportFilename,
  toInvoiceExportQuery,
} from '../logic/invoice-export';

/**
 * Exports the invoices the filters select and saves the file. The export is a
 * stream behind the bearer token of the session, so the request is made by the
 * client and the browser is handed the blob; a refusal is thrown as the SDK
 * throws it, for the caller to show. Nothing about the list is refreshed: an
 * export reads and changes nothing.
 */
export function downloadInvoiceExport(
  variant: InvoiceExportVariant,
  filters: InvoiceExportFilters,
  now?: Date,
): Promise<void> {
  return downloadBlob(
    () =>
      exportInvoices({
        parseAs: 'blob',
        query: toInvoiceExportQuery(variant, filters),
        throwOnError: true,
      }),
    invoiceExportFilename(variant, now),
  );
}
