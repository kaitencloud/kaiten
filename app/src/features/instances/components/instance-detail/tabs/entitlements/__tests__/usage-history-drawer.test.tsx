import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { UsageReport, UsageReportPage } from '@/api-client';
import {
  handleExportUsageReports,
  handleGetBillingCapabilities,
  handleListUsageReports,
} from '@/api-client/msw.gen';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
} from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import {
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import type { UsageHistoryRange } from '../../../../../queries';
import { UsageHistoryDrawer } from '../usage-history';

const downloadBlob = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

// The browser is the edge of an export: what it was handed is the file.
vi.mock('@/lib/download-blob', () => ({ downloadBlob }));
vi.mock('sonner', () => ({ toast }));

useBillingTexts();

beforeEach(() => {
  downloadBlob.mockReset();
  toast.error.mockReset();
  // The real function makes the request it is given and saves what comes back.
  downloadBlob.mockImplementation(
    async (request: () => Promise<unknown>, filename: string) => {
      await request();

      return filename;
    },
  );
});

const report = (reportSeq: number, overrides: Partial<UsageReport> = {}): UsageReport => ({
  aggregationMethod: 'sum',
  behavior: 'append',
  delta: '800',
  entitlementId: 'ent-1',
  eventCountAfter: reportSeq,
  instanceId: 'ins-1',
  licenseId: 'lic-1',
  limitValue: '100000',
  overageDelta: '0',
  reportSeq,
  reportedAt: '2027-03-02T10:00:00.000Z',
  reportedValue: '800',
  transactionId: `tx-${reportSeq}`,
  valueAfter: String(reportSeq * 800),
  valueBefore: String((reportSeq - 1) * 800),
  windowEnd: '2027-04-01T00:00:00.000Z',
  windowStart: '2027-03-01T00:00:00.000Z',
  ...overrides,
});

/** Answers each read with the next of `pages`, and records the query of each. */
function serveHistory(...pages: UsageReportPage[]) {
  const asked: URLSearchParams[] = [];
  server.use(
    handleListUsageReports(({ request }) => {
      asked.push(new URL(request.url).searchParams);

      return HttpResponse.json(pages[Math.min(asked.length, pages.length) - 1]);
    }),
  );

  return asked;
}

// The period lives in the URL, which the tab writes it to and reads it back from:
// a state stands for the URL here, and `onRangeChange` is what the tab navigates with.
function Harness({
  initial = {},
  onClose,
  onRangeChange,
}: {
  initial?: UsageHistoryRange;
  onClose: () => void;
  onRangeChange?: (range: UsageHistoryRange) => void;
}) {
  const [range, setRange] = useState(initial);

  return (
    <UsageHistoryDrawer
      entitlementName="API calls"
      entitlementSlug="api-calls"
      instanceName="Globex Production"
      instanceSlug="globex-production"
      onClose={onClose}
      onRangeChange={(next) => {
        onRangeChange?.(next);
        setRange(next);
      }}
      range={range}
    />
  );
}

const renderDrawer = (
  onClose = vi.fn(),
  options: {
    initial?: UsageHistoryRange;
    onRangeChange?: (range: UsageHistoryRange) => void;
  } = {},
) => {
  renderWithClient(<Harness onClose={onClose} {...options} />);

  return { onClose };
};

describe('the usage history of an entitlement', () => {
  it('names the entitlement and the instance, and is busy while the first page is on the way', async () => {
    server.use(
      handleListUsageReports(async () => {
        await delay('infinite');

        return HttpResponse.json({ items: [] });
      }),
    );
    renderDrawer();

    expect(
      screen.getByRole('dialog', { name: 'Usage history' }),
    ).toHaveTextContent('API calls on Globex Production');
    expect(
      screen.getByRole('status', { name: 'Loading the usage history' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('lists the reports in the order they were accepted, with the columns of an audit', async () => {
    serveHistory({ items: [report(1), report(2, { behavior: 'set', limitValue: undefined })] });
    renderDrawer();

    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Report',
      'Reported at',
      'Behavior',
      'Value',
      'Counter',
      'Change',
      'Limit',
      'Transaction',
      'Properties',
    ]);
    const [first, second] = within(table).getAllByRole('row').slice(1);
    expect(first).toHaveTextContent('Mar 2, 2027, 10:00 AM (UTC)');
    expect(first).toHaveTextContent('Append');
    expect(first).toHaveTextContent('0 → 800');
    expect(first).toHaveTextContent('100,000');
    expect(first).toHaveTextContent('tx-1');
    expect(second).toHaveTextContent('Set');
    expect(second).toHaveTextContent('No limit');
    expect(screen.queryByText(/reports? shown/)).toBeNull();
  });

  it('asks the API for the pair, a page of a hundred and no period', async () => {
    const asked = serveHistory({ items: [report(1)] });
    renderDrawer();

    await screen.findByRole('table');

    expect(asked).toHaveLength(1);
    expect(asked[0].get('limit')).toBe('100');
    for (const name of ['afterSeq', 'from', 'to']) {
      expect(asked[0].has(name), name).toBe(false);
    }
  });

  it('reads the next page after the last report of the page, and keeps the rows it has', async () => {
    const asked = serveHistory(
      { items: [report(1), report(2)], nextAfterSeq: 2 },
      { items: [report(3)] },
    );
    renderDrawer();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Load more reports' }),
    );

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4));
    expect(asked[1].get('afterSeq')).toBe('2');
    expect(screen.queryByRole('button', { name: 'Load more reports' })).toBeNull();
  });

  it('marks the report where the limit in force moved', async () => {
    serveHistory({
      items: [report(1), report(2, { limitValue: '150000' }), report(3, { limitValue: '150000' })],
    });
    renderDrawer();

    await screen.findByRole('table');

    expect(screen.getAllByText('Limit changed')).toHaveLength(1);
  });

  it('reads the reports of the days typed, in UTC, the second day being where the period ends', async () => {
    const asked = serveHistory({ items: [report(1)] });
    renderDrawer();
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('From'), '2027-03-01');
    await userEvent.type(screen.getByLabelText('Before'), '2027-04-01');

    await waitFor(() => expect(asked.length).toBeGreaterThan(1));
    const last = asked.at(-1);
    expect(last?.get('from')).toBe('2027-03-01T00:00:00.000Z');
    expect(last?.get('to')).toBe('2027-04-01T00:00:00.000Z');
    expect(last?.has('afterSeq')).toBe(false);
  });

  it('reads the period it is given, from the URL, and shows it in the fields', async () => {
    const asked = serveHistory({ items: [report(1)] });
    renderDrawer(vi.fn(), {
      initial: {
        from: '2027-03-01T00:00:00.000Z',
        to: '2027-04-01T00:00:00.000Z',
      },
    });

    await screen.findByRole('table');

    expect(asked[0].get('from')).toBe('2027-03-01T00:00:00.000Z');
    expect(asked[0].get('to')).toBe('2027-04-01T00:00:00.000Z');
    expect(screen.getByLabelText('From')).toHaveValue('2027-03-01');
    expect(screen.getByLabelText('Before')).toHaveValue('2027-04-01');
  });

  it('writes the period typed for the URL to keep, and reads the reports of it', async () => {
    serveHistory({ items: [report(1)] });
    const onRangeChange = vi.fn();
    renderDrawer(vi.fn(), { onRangeChange });
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('From'), '2027-03-01');

    expect(onRangeChange).toHaveBeenLastCalledWith({
      from: '2027-03-01T00:00:00.000Z',
      to: undefined,
    });
  });

  it('says there is none, and which period it looked at', async () => {
    serveHistory({ items: [] });
    renderDrawer();

    const empty = await screen.findByTestId('usage-history-empty');
    expect(within(empty).getByText('No usage reports')).toBeInTheDocument();
    expect(
      within(empty).getByText('No report was accepted during this period.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/With no period, the last 30 days are shown/),
    ).toBeInTheDocument();
  });

  it('shows a refusal with a way to ask again, and reads again when asked', async () => {
    let calls = 0;
    server.use(
      handleListUsageReports(() => {
        calls += 1;

        return calls === 1
          ? refusal(500, { detail: 'The usage store is down' })
          : HttpResponse.json({ items: [report(1)] });
      }),
    );
    renderDrawer();

    const problem = await screen.findByTestId('usage-history-error');
    expect(problem).toHaveTextContent('The usage store is down');
    await userEvent.click(within(problem).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('closes when asked', async () => {
    serveHistory({ items: [] });
    const { onClose } = renderDrawer();
    await screen.findByTestId('usage-history-empty');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('a period that reaches before what the organization keeps', () => {
  const outsideRetention = () =>
    refusal(422, {
      code: 'ListUsageReports.OutsideRetention',
      detail: 'the usage history is kept from 2026-04-15T22:14:07Z: from must not be earlier',
      errors: [
        {
          location: 'query.from',
          message: 'retentionStart',
          value: '2026-04-15T22:14:07Z',
        },
      ],
    });

  it('says beyond how many months, where the kept usage begins, and offers to start there', async () => {
    server.use(
      handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    );
    const asked: URLSearchParams[] = [];
    server.use(
      handleListUsageReports(({ request }) => {
        const params = new URL(request.url).searchParams;
        asked.push(params);

        // Only the period typed is refused: the first read has none.
        return params.has('from') &&
          Date.parse(params.get('from') ?? '') < Date.parse('2026-04-16T00:00:00Z')
          ? outsideRetention()
          : HttpResponse.json({ items: [report(1)] });
      }),
    );
    renderDrawer();
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('From'), '2020-01-01');

    const notice = await screen.findByTestId('usage-history-outside-retention');
    // The capabilities the retention is read from are the app's, usually cached
    // before a drawer opens: here they arrive after the refusal.
    expect(
      await within(notice).findByText('Beyond your retention of 18 months'),
    ).toBeInTheDocument();
    expect(notice).toHaveTextContent('Usage before Apr 15, 2026 (UTC) is no longer kept.');
    // The first day that begins inside what is kept: a period is typed in days.
    await userEvent.click(
      within(notice).getByRole('button', { name: 'Show from Apr 16, 2026 (UTC)' }),
    );

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(asked.at(-1)?.get('from')).toBe('2026-04-16T00:00:00.000Z');
    expect(screen.getByLabelText('From')).toHaveValue('2026-04-16');
  });

  it('is told with billing off, since the history is not billing\'s', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilities({
          disabledReason: 'DEPLOYMENT_DISABLED',
          enabled: false,
          usageHistoryRetentionMonths: 6,
        }),
      }),
      handleListUsageReports(() => outsideRetention()),
    );
    renderDrawer();

    expect(
      await screen.findByText('Beyond your retention of 6 months'),
    ).toBeInTheDocument();
  });

  it('says it without a number of months when the capabilities do not', async () => {
    server.use(handleListUsageReports(() => outsideRetention()));
    renderDrawer();

    expect(
      await screen.findByText('Beyond what your organization keeps'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('usage-history-outside-retention')).toHaveTextContent(
      'Usage before Apr 15, 2026 (UTC) is no longer kept.',
    );
  });
});

describe('the export of the usage history', () => {
  it('saves the CSV of the period shown, under a name of its own', async () => {
    serveHistory({ items: [report(1)] });
    const exported: URL[] = [];
    server.use(
      handleExportUsageReports(({ request }) => {
        exported.push(new URL(request.url));

        return new HttpResponse('report_seq\n1\n', {
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );
    renderDrawer();
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('From'), '2027-03-01');
    await userEvent.type(screen.getByLabelText('Before'), '2027-03-31');

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(downloadBlob.mock.calls[0][1]).toMatch(
      /^usage-globex-production-api-calls-\d{8}T\d{6}Z\.csv$/,
    );
    await waitFor(() => expect(exported).toHaveLength(1));
    expect(exported[0].searchParams.get('format')).toBe('csv');
    expect(exported[0].searchParams.get('from')).toBe('2027-03-01T00:00:00.000Z');
    expect(exported[0].searchParams.get('to')).toBe('2027-03-31T00:00:00.000Z');
  });

  it('shows the refusal of the API as it was written, and leaves the drawer as it was', async () => {
    serveHistory({ items: [report(1)] });
    server.use(
      handleExportUsageReports(() =>
        refusal(422, { detail: 'the range spans more than 366 days; split it' }),
      ),
    );
    renderDrawer();
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(toast.error.mock.calls[0][0])).toContain('366 days');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('says why a period of more than 366 days cannot be exported, and keeps the button where it is', async () => {
    serveHistory({ items: [report(1)] });
    renderDrawer();
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('From'), '2020-01-01');

    const button = screen.getByRole('button', { name: 'Export CSV' });
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toHaveAccessibleDescription(
      'A CSV covers up to 366 days: narrow the period to export it.',
    );
    await userEvent.click(button);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
