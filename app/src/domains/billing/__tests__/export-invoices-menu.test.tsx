import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleExportInvoices } from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { ExportInvoicesMenu } from '../components';

const downloadBlob = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

// The browser is the edge of an export: what it was handed is the file.
vi.mock('@/lib/download-blob', () => ({ downloadBlob }));
vi.mock('sonner', () => ({ toast }));

useBillingTexts();

beforeEach(() => {
  downloadBlob.mockReset();
  // The real function makes the request it is given and saves what comes back.
  downloadBlob.mockImplementation(
    async (request: () => Promise<unknown>, filename: string) => {
      await request();

      return filename;
    },
  );
  toast.error.mockReset();
});

describe('exporting the invoices of a list', () => {
  const filters = { customerSlug: 'initech', status: ['MANUAL' as const] };

  /** Answers the export, and records the query the API was asked with. */
  function serveExport(answer: () => Response = () => new HttpResponse('csv')) {
    const asked: URLSearchParams[] = [];
    server.use(
      handleExportInvoices(({ request }) => {
        asked.push(new URL(request.url).searchParams);

        return answer();
      }),
    );

    return asked;
  }

  // The export is a request like another: it has the client of the page.
  const renderMenu = (unapplied?: readonly string[]) =>
    renderWithClient(
      <ExportInvoicesMenu filters={filters} unapplied={unapplied} />,
    );

  const open = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
  };

  it.each([
    ['CSV by invoice line', 'csv', 'line', /^invoices-by-line-\d{8}T\d{6}Z\.csv$/],
    ['CSV by invoice', 'csv', 'invoice', /^invoices-by-invoice-\d{8}T\d{6}Z\.csv$/],
    ['NDJSON, one invoice per line', 'json', null, /^invoices-\d{8}T\d{6}Z\.ndjson$/],
  ])(
    'offers %s, with the filters it was given and none of the paging',
    async (label, format, granularity, filename) => {
      const asked = serveExport();
      renderMenu();

      await open();
      await userEvent.click(
        await screen.findByRole('menuitem', { name: label }),
      );

      await waitFor(() => expect(asked).toHaveLength(1));
      expect(asked[0].get('format')).toBe(format);
      expect(asked[0].get('granularity')).toBe(granularity);
      expect(asked[0].get('customerSlug')).toBe('initech');
      expect(asked[0].getAll('status')).toEqual(['MANUAL']);
      // The export walks every page by itself.
      expect(asked[0].has('cursor')).toBe(false);
      expect(asked[0].has('limit')).toBe(false);
      expect(downloadBlob).toHaveBeenCalledWith(
        expect.any(Function),
        expect.stringMatching(filename),
      );
    },
  );

  it('says nothing of the filters it leaves out when there are none', async () => {
    renderMenu();

    await open();

    expect(await screen.findByRole('menuitem', { name: 'CSV by invoice' })).toBeInTheDocument();
    expect(screen.queryByTestId('export-unapplied')).toBeNull();
  });

  it('says which filter of the screen the file does not apply, above the choices', async () => {
    renderMenu(['Search']);

    await open();

    expect(await screen.findByTestId('export-unapplied')).toHaveTextContent(
      'This filter is not applied to the file: Search.',
    );
    expect(screen.getByRole('menuitem', { name: 'CSV by invoice' })).toBeInTheDocument();
  });

  it('names every one of several, in the plural', async () => {
    renderMenu(['Search', 'Service period start']);

    await open();

    expect(await screen.findByTestId('export-unapplied')).toHaveTextContent(
      'These filters are not applied to the file: Search, Service period start.',
    );
  });

  it('shows the refusal of the API as it was written, and changes nothing else', async () => {
    serveExport(() => refusal(503, { detail: 'the export is not available' }));
    renderMenu();

    await open();
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'CSV by invoice' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('the export is not available'),
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
  });
});
