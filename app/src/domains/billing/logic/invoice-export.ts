import type { ExportInvoicesData } from '@/api-client';
import { formatFileStamp } from '@/lib/file-stamp';

/**
 * The ways the invoices are exported: a CSV with a row for every line, a CSV with
 * a row for every invoice, and NDJSON, where every line is an invoice with its
 * lines. All of them take the filters of the list, and carry every amount as an
 * integer in minor units with the exponent of its currency beside it, so that a
 * spreadsheet never reads a float.
 */
export const INVOICE_EXPORT_VARIANTS = [
  'csv-lines',
  'csv-invoices',
  'ndjson',
] as const;

export type InvoiceExportVariant = (typeof INVOICE_EXPORT_VARIANTS)[number];

/** The filters an export takes: those of the list, but not its paging. */
export type InvoiceExportFilters = Omit<
  NonNullable<ExportInvoicesData['query']>,
  'cursor' | 'format' | 'granularity' | 'limit' | 'updatedSince'
>;

// The granularity belongs to the CSV: NDJSON is always an invoice with its lines.
const VARIANT_QUERY = {
  'csv-invoices': { format: 'csv', granularity: 'invoice' },
  'csv-lines': { format: 'csv', granularity: 'line' },
  ndjson: { format: 'json', granularity: undefined },
} as const satisfies Record<
  InvoiceExportVariant,
  Pick<NonNullable<ExportInvoicesData['query']>, 'format' | 'granularity'>
>;

const EXTENSIONS = {
  'csv-invoices': 'csv',
  'csv-lines': 'csv',
  ndjson: 'ndjson',
} as const satisfies Record<InvoiceExportVariant, string>;

const FILE_NAME_INFIX = {
  'csv-invoices': '-by-invoice',
  'csv-lines': '-by-line',
  ndjson: '',
} as const satisfies Record<InvoiceExportVariant, string>;

/**
 * The query of an export: the filters, with what the export reads itself
 * (it walks every page, so it takes neither a cursor nor a limit) left out, and
 * the format and the granularity the variant asks for.
 */
export function toInvoiceExportQuery(
  variant: InvoiceExportVariant,
  filters: InvoiceExportFilters,
): NonNullable<ExportInvoicesData['query']> {
  const { format, granularity } = VARIANT_QUERY[variant];

  return { ...filters, format, granularity };
}

/**
 * The name of the file an export is saved as: `invoices-by-line-20271004T153000Z.csv`.
 * The API proposes one in `Content-Disposition`, which a browser reads only when
 * the API is on the origin of the console or exposes the header, and the local
 * stack does not: the console names its files itself, with the UTC moment of the
 * download, so that two exports never overwrite each other.
 */
export function invoiceExportFilename(
  variant: InvoiceExportVariant,
  now: Date = new Date(),
): string {
  return `invoices${FILE_NAME_INFIX[variant]}-${formatFileStamp(now)}.${EXTENSIONS[variant]}`;
}
