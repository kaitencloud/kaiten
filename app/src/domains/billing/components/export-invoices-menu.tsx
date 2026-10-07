import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useExportInvoices } from '../hooks/use-export-invoices';
import {
  INVOICE_EXPORT_VARIANTS,
  type InvoiceExportFilters,
  type InvoiceExportVariant,
} from '../logic/invoice-export';

const VARIANT_LABEL_KEYS = {
  'csv-invoices': 'Features.Billing.InvoiceExport.csvInvoices',
  'csv-lines': 'Features.Billing.InvoiceExport.csvLines',
  ndjson: 'Features.Billing.InvoiceExport.ndjson',
} as const satisfies Record<InvoiceExportVariant, string>;

type ExportInvoicesMenuProps = {
  /** What is exported: the invoices these filters select, not only the page that is loaded. */
  filters: InvoiceExportFilters;
};

/**
 * Exports the invoices the filters select (none: every invoice of the
 * organization), in the shape an accounting system or a spreadsheet takes: a CSV with a row for each line, a CSV with a row for each
 * invoice, or NDJSON with each invoice and its lines on a line. The file holds
 * every invoice of the filters, however many pages the list has read. A refusal
 * of the API is shown as it was written.
 */
export function ExportInvoicesMenu({ filters }: ExportInvoicesMenuProps) {
  const { t } = useTranslation();
  const { isPending, mutate } = useExportInvoices();

  function renderVariant(variant: InvoiceExportVariant) {
    return (
      <DropdownMenuItem
        key={variant}
        onClick={() => mutate({ filters, variant })}
      >
        {t(VARIANT_LABEL_KEYS[variant])}
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button disabled={isPending} type="button" variant="outline">
            {isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {t('Features.Billing.InvoiceExport.button')}
          </Button>
        }
      />
      <DropdownMenuContent>
        {INVOICE_EXPORT_VARIANTS.map(renderVariant)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
