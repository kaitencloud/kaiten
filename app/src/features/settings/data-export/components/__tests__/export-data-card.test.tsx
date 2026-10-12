import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleExportInvoices,
  handleExportOrganizationUsageReports,
  handleGetBillingCapabilities,
} from '@/api-client/msw.gen';
import { billingCapabilitiesProfiles } from '../../../../../../e2e/app/_support/model/billing-capabilities';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { ExportDataCard } from '../export-data-card';

const getAuthToken = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
// The browser is the edge of an export: what it was handed is the file.
vi.mock('@/lib/download-blob', () => ({ downloadBlob }));
vi.mock('sonner', () => ({ toast }));

useBillingTexts();

beforeEach(() => {
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:instances']),
  );
  downloadBlob.mockReset();
  toast.error.mockReset();
  // The real function makes the request it is given and saves what comes back.
  downloadBlob.mockImplementation(
    async (request: () => Promise<unknown>, filename: string) => {
      await request();

      return filename;
    },
  );
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
  );
});

const months = () =>
  within(screen.getByRole('list', { name: 'Months of usage' })).getAllByRole(
    'listitem',
  );

describe('exporting the usage before an organization is deleted', () => {
  it('lists a month a file, the month it is and the 18 the deployment keeps, newest first', async () => {
    renderWithClient(<ExportDataCard />);

    await waitFor(() => expect(months()).toHaveLength(19));
    const now = new Date();
    const label = new Intl.DateTimeFormat('en', {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    }).format(now);
    expect(months()[0]).toHaveTextContent(label);
  });

  it('asks for the month the row names, for every instance, and hands the file to the browser', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      handleExportOrganizationUsageReports(({ request }) => {
        asked.push(new URL(request.url).searchParams);

        return new HttpResponse('report_seq\n1\n');
      }),
    );
    renderWithClient(<ExportDataCard />);
    await waitFor(() => expect(months()).toHaveLength(19));

    // The second row is the month before the current one.
    await userEvent.click(
      within(months()[1]).getByRole('button', { name: /Export the usage of/ }),
    );

    await waitFor(() => expect(asked).toHaveLength(1));
    const [from, to] = [asked[0].get('from') ?? '', asked[0].get('to') ?? ''];
    expect(asked[0].get('format')).toBe('csv');
    expect(from).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
    expect(to).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeLessThanOrEqual(31);
    expect(downloadBlob.mock.calls[0][1]).toMatch(
      /^usage-\d{4}-\d{2}-\d{8}T\d{6}Z\.csv$/,
    );
  });

  it('shows the refusal of the API as it was written, and changes nothing else', async () => {
    server.use(
      handleExportOrganizationUsageReports(() =>
        refusal(503, { detail: 'the export is not available' }),
      ),
    );
    renderWithClient(<ExportDataCard />);
    await waitFor(() => expect(months()).toHaveLength(19));

    await userEvent.click(
      within(months()[0]).getByRole('button', { name: /Export the usage of/ }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('the export is not available'),
    );
    expect(
      within(months()[0]).getByRole('button', { name: /Export the usage of/ }),
    ).toBeEnabled();
  });

  it('asks for one file at a time: the others wait for the one that is on its way', async () => {
    server.use(
      handleExportOrganizationUsageReports(async () => {
        await delay('infinite');

        return new HttpResponse('never');
      }),
    );
    renderWithClient(<ExportDataCard />);
    await waitFor(() => expect(months()).toHaveLength(19));

    await userEvent.click(
      within(months()[0]).getByRole('button', { name: /Export the usage of/ }),
    );

    await waitFor(() =>
      expect(
        within(months()[1]).getByRole('button', { name: /Export the usage of/ }),
      ).toBeDisabled(),
    );
  });
});

describe('exporting the invoices before an organization is deleted', () => {
  it('offers every invoice of the organization, with no filter', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      handleExportInvoices(({ request }) => {
        asked.push(new URL(request.url).searchParams);

        return new HttpResponse('csv');
      }),
    );
    renderWithClient(<ExportDataCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }));

    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'CSV by invoice line' }),
    );

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].get('format')).toBe('csv');
    expect(asked[0].get('granularity')).toBe('line');
    for (const filter of ['customerSlug', 'instanceSlug', 'status', 'kind']) {
      expect(asked[0].has(filter), filter).toBe(false);
    }
  });

  it('is absent for a session that may not export invoices, and the usage stays', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    renderWithClient(<ExportDataCard />);

    await screen.findByTestId('usage-export');
    await waitFor(() => expect(screen.queryByTestId('invoices-export')).toBeNull());
  });
});
