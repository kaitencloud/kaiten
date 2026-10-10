import { listInvoiceLineReports } from '@/api-client';
import { downloadBlob } from '@/lib/download-blob';

/**
 * The name of the CSV of a line's reports: `invoice-1f3a9c2e-line-1-usage-reports.csv`.
 * The API proposes one, which a browser cannot read from the local stack (its CORS
 * policy does not expose `Content-Disposition`), so the console names the file:
 * the first characters of the invoice's id, since the id is a UUID nobody reads
 * whole, and the number of the line.
 */
export function lineReportsFilename(
  invoiceId: string,
  lineSeq: number,
): string {
  return `invoice-${invoiceId.slice(0, 8)}-line-${lineSeq}-usage-reports.csv`;
}

/**
 * Saves every usage report a metered line was measured from as a CSV, not only the
 * pages that were read. The export is a stream behind the bearer token of the
 * session, so the request is the client's and the browser is handed the blob; a
 * refusal is thrown as the SDK throws it, for the caller to show.
 */
export function downloadLineReports(
  invoiceId: string,
  lineId: string,
  lineSeq: number,
): Promise<void> {
  return downloadBlob(
    async () => {
      const result = await listInvoiceLineReports({
        parseAs: 'blob',
        path: { invoiceId, lineId },
        query: { format: 'csv' },
        throwOnError: true,
      });

      // The contract types the answer as the JSON page. With `format=csv` it is the
      // file, which the client hands over as the blob it was asked to read.
      return result as unknown as { data: Blob; response: Response };
    },
    lineReportsFilename(invoiceId, lineSeq),
  );
}
