import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleListInvoiceLineReports } from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`.
import '@/lib/api/bootstrap';
import {
  downloadLineReports,
  lineReportsFilename,
} from '../download-line-reports';

// The browser is the edge: what it was handed is what the file would hold.
const downloadBlob = vi.hoisted(() => vi.fn());

vi.mock('@/lib/download-blob', () => ({ downloadBlob }));

describe('the name of the CSV of a line', () => {
  it('names the invoice by the start of its id, and the line by its position', () => {
    expect(
      lineReportsFilename('1f3a9c2e-5b7d-4e1a-9c0f-aaaaaaaaaaaa', 2),
    ).toBe('invoice-1f3a9c2e-line-2-usage-reports.csv');
  });
});

describe('saving every report of a line', () => {
  beforeEach(() => {
    downloadBlob.mockReset();
    // The real function makes the request it is given and saves what comes back.
    downloadBlob.mockImplementation(
      async (request: () => Promise<{ data: Blob }>, filename: string) => ({
        content: await (await request()).data.text(),
        filename,
      }),
    );
  });

  it('asks the API for the CSV, and hands what it sent to the browser under a name of its own', async () => {
    const asked: Array<{ invoiceId: unknown; lineId: unknown; url: URL }> = [];
    server.use(
      handleListInvoiceLineReports(({ params, request }) => {
        asked.push({
          invoiceId: params.invoiceId,
          lineId: params.lineId,
          url: new URL(request.url),
        });

        return new HttpResponse('reportSeq,delta\n1,100\n', {
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );

    await downloadLineReports('inv-12345678', 'line-1', 3);

    expect(asked).toHaveLength(1);
    expect(asked[0].invoiceId).toBe('inv-12345678');
    expect(asked[0].lineId).toBe('line-1');
    expect(asked[0].url.searchParams.get('format')).toBe('csv');
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'invoice-inv-1234-line-3-usage-reports.csv',
    );
    await expect(downloadBlob.mock.results[0].value).resolves.toEqual({
      content: 'reportSeq,delta\n1,100\n',
      filename: 'invoice-inv-1234-line-3-usage-reports.csv',
    });
  });

  it('lets a refusal of the API reach the caller, which shows it', async () => {
    server.use(
      handleListInvoiceLineReports(() =>
        HttpResponse.json(
          { detail: 'the reports are not available', status: 503 },
          { status: 503 },
        ),
      ),
    );

    await expect(downloadLineReports('inv-1', 'line-1', 1)).rejects.toMatchObject(
      { status: 503 },
    );
  });
});
