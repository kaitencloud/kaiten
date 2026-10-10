import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type {
  InvoiceExportFilters,
  InvoiceExportVariant,
} from '../logic/invoice-export';
import { downloadInvoiceExport } from '../queries/download-invoice-export';

/**
 * Saves the invoices a list selects as a file: a request like another, with its
 * own pending state, which the menu that offers the export reads. A refusal of
 * the API is shown as it was written, and nothing else changes: an export reads
 * and changes nothing, so no query is refreshed.
 */
export function useExportInvoices() {
  return useMutation({
    mutationFn: ({
      filters,
      variant,
    }: {
      filters: InvoiceExportFilters;
      variant: InvoiceExportVariant;
    }) => downloadInvoiceExport(variant, filters),
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}
