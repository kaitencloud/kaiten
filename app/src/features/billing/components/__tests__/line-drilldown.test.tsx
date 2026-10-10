import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { InvoiceLine, UsageReport } from '@/api-client';
import { NULL_LINE_MEMBERS } from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { getLimitChangeSeqs } from '@/domains/billing';
import { ApiError } from '@/lib/errors';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { LineReportsSection } from '../line-drilldown/line-reports-section';
import { LineSummaryCard } from '../line-drilldown/line-summary-card';
import { OutsideRetentionNotice } from '../line-drilldown/outside-retention-notice';
import { UsageWindowCard } from '../line-drilldown/usage-window-card';
import type { useLineReports } from '../../hooks';
import { groupReportsByWindow } from '../../utils/usage-windows';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
}));

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

const MARCH = {
  windowEnd: '2027-04-01T00:00:00.000Z',
  windowStart: '2027-03-01T00:00:00.000Z',
};
const APRIL = {
  windowEnd: '2027-05-01T00:00:00.000Z',
  windowStart: '2027-04-01T00:00:00.000Z',
};

const report = (
  seq: number,
  overrides: Partial<UsageReport> = {},
): UsageReport => ({
  aggregationMethod: 'sum',
  behavior: 'append',
  delta: '1000',
  entitlementId: 'ent-1',
  eventCountAfter: seq,
  instanceId: 'ins-1',
  licenseId: 'lic-1',
  limitValue: '100000',
  overageDelta: '0',
  reportSeq: seq,
  reportedAt: '2027-03-02T08:00:00.000Z',
  reportedValue: '1000',
  transactionId: `tx-${seq}`,
  valueAfter: String(seq * 1000),
  valueBefore: String((seq - 1) * 1000),
  ...MARCH,
  ...overrides,
});

const cardFor = (
  reports: UsageReport[],
  props: { isPartial?: boolean; measuresOverage?: boolean } = {},
) => {
  const [window] = groupReportsByWindow(reports);

  return (
    <UsageWindowCard
      isPartial={props.isPartial ?? false}
      limitChanges={getLimitChangeSeqs(reports)}
      measuresOverage={props.measuresOverage ?? false}
      window={window}
    />
  );
};

describe('the card of a reset window', () => {
  it('is titled by the window and sums what its reports moved the usage by', () => {
    render(
      cardFor([report(1, { delta: '38000' }), report(2, { delta: '12200' })]),
    );

    expect(screen.getByText('Mar 1 – Apr 1, 2027 (UTC)')).toBeInTheDocument();
    expect(screen.getByTestId('usage-window-sum')).toHaveTextContent(
      '2 reports · usage 50,200',
    );
  });

  it('sums the overage instead for a line that bills the overage', () => {
    render(
      cardFor(
        [report(1, { overageDelta: '0' }), report(2, { overageDelta: '4200' })],
        { measuresOverage: true },
      ),
    );

    expect(screen.getByTestId('usage-window-sum')).toHaveTextContent(
      '2 reports · overage 4,200',
    );
  });

  it('gives no sum while more reports are to be read: half a window is not a result', () => {
    render(cardFor([report(1), report(2)], { isPartial: true }));

    expect(screen.getByTestId('usage-window-sum')).toHaveTextContent(
      '2 reports so far · more to load',
    );
    expect(screen.getByTestId('usage-window-sum')).not.toHaveTextContent('usage');
  });

  it('shows each report with its number, its time, the counter before and after, and its limit', () => {
    render(cardFor([report(41, { limitValue: '150', valueAfter: '9', valueBefore: '4' })]));

    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('41')).toBeInTheDocument();
    expect(within(row).getByText('Mar 2, 2027, 8:00 AM (UTC)')).toBeInTheDocument();
    expect(within(row).getByText('Append')).toBeInTheDocument();
    expect(within(row).getByText('4 → 9')).toBeInTheDocument();
    expect(within(row).getByText('150')).toBeInTheDocument();
    expect(within(row).getByText('tx-41')).toBeInTheDocument();
  });

  it('says how a report moved the counter in the words of the language, not the API\'s', async () => {
    render(
      cardFor([report(1), report(2, { behavior: 'set' })]),
    );
    const [append, set] = screen.getAllByRole('row').slice(1);
    expect(within(append).getByText('Append')).toBeInTheDocument();
    expect(within(set).getByText('Set')).toBeInTheDocument();

    await testI18n.changeLanguage('fr');
    try {
      const { container } = render(
        cardFor([report(1), report(2, { behavior: 'set' })]),
      );
      expect(within(container).getByText('Ajout')).toBeInTheDocument();
      expect(within(container).getByText('Remplacement')).toBeInTheDocument();
      expect(within(container).queryByText('append')).toBeNull();
    } finally {
      await testI18n.changeLanguage('en');
    }
  });

  it('shows a way the console does not know as the API named it', () => {
    render(
      cardFor([report(1, { behavior: 'merge' as UsageReport['behavior'] })]),
    );

    expect(within(screen.getAllByRole('row')[1]).getByText('merge')).toBeInTheDocument();
  });

  it('marks the report where the limit changed, in words and not by colour alone', () => {
    render(
      cardFor([
        report(1, { limitValue: '100' }),
        report(2, { limitValue: '100' }),
        report(3, { limitValue: '250' }),
      ]),
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).queryByText('Limit changed')).toBeNull();
    expect(within(rows[1]).queryByText('Limit changed')).toBeNull();
    expect(within(rows[2]).getByText('Limit changed')).toBeInTheDocument();
    expect(rows[2]).toHaveClass('bg-muted/60');
  });

  it('says a meter had no limit', () => {
    render(cardFor([report(1, { limitValue: undefined })]));

    expect(screen.getByText('No limit')).toBeInTheDocument();
  });

  it('opens the properties a report was sent with, and shows none for one that had none', async () => {
    render(
      cardFor([
        report(1, { properties: { region: 'eu-west-1' } }),
        report(2, { properties: undefined }),
      ]),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Show the properties of report 1' }),
    );

    expect(await screen.findByText(/"region": "eu-west-1"/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show the properties of report 2' }),
    ).toBeNull();
  });

  it('titles the one window of an entitlement that never resets as its whole life', () => {
    render(
      cardFor([report(1, { windowEnd: undefined, windowStart: undefined })]),
    );

    expect(screen.getByText('Whole lifetime')).toBeInTheDocument();
  });
});

const line = (overrides: Partial<InvoiceLine> = {}): InvoiceLine => ({
  ...NULL_LINE_MEMBERS,
  amount: 420,
  description: '4,200 × $0.001 per call',
  id: 'line-1',
  label: 'API calls, overage',
  metering: {
    ledger: {
      firstSeq: 301,
      instanceId: null,
      lastSeq: 305,
      rows: 5,
      sumDelta: '104200',
      sumOverage: '4200',
    },
    measuredQuantity: '4200',
    negativeSegmentsFloored: 0,
    saleUnitFactor: '1',
    windows: 1,
  },
  overage: {
    limits: [{ limitValue: '100000', overagePercent: 50, rows: 5 }],
    overageMeasured: '4200',
    usageMeasured: '104200',
  },
  quantity: '4200',
  seq: 1,
  serviceFrom: '2027-03-01T00:00:00.000Z',
  serviceTo: '2027-04-01T00:00:00.000Z',
  type: 'OVERAGE',
  ...overrides,
});

describe('what the line came to', () => {
  it('shows the quantity it was measured at next to the one it bills, and its amount', () => {
    render(<LineSummaryCard invoice={{ currency: 'USD' }} line={line()} />);

    expect(screen.getByTestId('line-measured-quantity')).toHaveTextContent('4,200');
    expect(screen.getByTestId('line-billed-quantity')).toHaveTextContent('4,200');
    expect(screen.getByText('$4.20')).toBeInTheDocument();
    expect(screen.getByText('4,200 × $0.001 per call')).toBeInTheDocument();
  });

  it('names the reports the line came from, and the limits that applied', () => {
    render(<LineSummaryCard invoice={{ currency: 'USD' }} line={line()} />);

    expect(screen.getByTestId('line-fingerprint')).toHaveTextContent(
      'Reports 301–305 · 5 rows · Σ 104,200',
    );
    expect(screen.getByTestId('overage-limits')).toHaveTextContent(
      'Limit 100,000 (+50% accepted)',
    );
  });

  it('shows the sale unit only when it is not one', () => {
    const { rerender } = render(
      <LineSummaryCard invoice={{ currency: 'USD' }} line={line()} />,
    );
    expect(screen.queryByText('Measured units per sale unit')).toBeNull();

    rerender(
      <LineSummaryCard
        invoice={{ currency: 'USD' }}
        line={line({
          metering: { ...line().metering!, saleUnitFactor: '1000' },
        })}
      />,
    );
    expect(screen.getByText('Measured units per sale unit')).toBeInTheDocument();
  });

  it('says how many reset windows the period spans and how many were floored at zero', () => {
    render(
      <LineSummaryCard
        invoice={{ currency: 'USD' }}
        line={line({
          metering: { ...line().metering!, negativeSegmentsFloored: 1, windows: 2 },
        })}
      />,
    );

    expect(screen.getByText('2 windows')).toBeInTheDocument();
    expect(
      screen.getByText('1 window had a negative movement and counted as 0'),
    ).toBeInTheDocument();
  });
});

type Reports = ReturnType<typeof useLineReports>;

function sectionFor(
  state: Partial<Reports['query']> & { pages?: UsageReport[][] },
  line_: InvoiceLine = line(),
) {
  const pages = state.pages ?? [];
  const reports = pages.flat();
  const reading: Reports = {
    isOutsideRetention: false,
    limitChanges: getLimitChangeSeqs(reports),
    query: {
      data: pages.length ? { pages: pages.map((items) => ({ items })) } : undefined,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchNextPageError: false,
      isFetchingNextPage: false,
      isPending: false,
      refetch: vi.fn(),
      ...state,
    } as never,
    windows: groupReportsByWindow(reports),
  };

  return { reading, ui: <LineReportsSection line={line_} reports={reading} /> };
}

describe('the reports a line was measured from', () => {
  it('is busy while the first page is on the way', () => {
    render(sectionFor({ isPending: true }).ui);

    expect(screen.getByRole('status', { name: 'Loading the usage reports' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows one card per window, and no count of the reports it read', () => {
    render(
      sectionFor({
        pages: [[report(1), report(2), report(3, APRIL)]],
      }).ui,
    );

    expect(screen.getAllByTestId('usage-window')).toHaveLength(2);
    expect(screen.queryByText(/reports? shown/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load more reports' })).toBeNull();
  });

  it('asks for the next page when told to, and keeps the sum of the window it continues out until it is whole', async () => {
    const view = sectionFor(
      { hasNextPage: true, pages: [[report(1), report(2, APRIL)]] },
      line({ overage: undefined, type: 'USAGE' }),
    );
    render(view.ui);

    const [march, april] = screen.getAllByTestId('usage-window-sum');
    expect(march).toHaveTextContent('1 report · usage 1,000');
    expect(april).toHaveTextContent('1 report so far · more to load');

    await userEvent.click(screen.getByRole('button', { name: 'Load more reports' }));

    expect(view.reading.query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('disables "Load more" while the next page is on the way', () => {
    render(
      sectionFor({
        hasNextPage: true,
        isFetchingNextPage: true,
        pages: [[report(1)]],
      }).ui,
    );

    expect(screen.getByRole('button', { name: 'Load more reports' })).toBeDisabled();
  });

  it('keeps the reports read and says why the next page failed', () => {
    render(
      sectionFor({
        error: new ApiError({
          data: { detail: 'the journal is busy', status: 503 },
          status: 503,
        }),
        hasNextPage: true,
        isError: true,
        isFetchNextPageError: true,
        pages: [[report(1)]],
      }).ui,
    );

    expect(screen.getByTestId('usage-window')).toBeInTheDocument();
    expect(screen.getByText('the journal is busy')).toBeInTheDocument();
  });

  it('says why the first page was refused, with a way to ask again', async () => {
    const view = sectionFor({
      error: new ApiError({
        data: { detail: 'the journal is busy', errorId: 'trace-9', status: 500 },
        status: 500,
      }),
      isError: true,
    });
    render(view.ui);

    expect(screen.getByTestId('line-reports-error')).toBeInTheDocument();
    expect(screen.getByText('the journal is busy')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(view.reading.query.refetch).toHaveBeenCalledTimes(1);
  });

  it('says a line had no report', () => {
    render(sectionFor({ pages: [[]] }).ui);

    expect(screen.getByTestId('line-reports-empty')).toHaveTextContent(
      'No usage reports',
    );
  });

  it('falls back on what the invoice kept when the reports are no longer kept', () => {
    const view = sectionFor({
      error: new ApiError({
        data: {
          code: 'ListInvoiceLineReports.OutsideRetention',
          detail: 'the reports are gone',
          status: 422,
        },
        status: 422,
      }),
      isError: true,
    });
    view.reading.isOutsideRetention = true;
    render(<LineReportsSection line={line()} reports={view.reading} />);

    const notice = screen.getByTestId('outside-retention');
    expect(notice).toHaveTextContent('The reports of this line are no longer kept');
    expect(within(notice).getByTestId('line-fingerprint')).toHaveTextContent(
      'Reports 301–305 · 5 rows · Σ 104,200',
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('the notice for reports that are no longer kept', () => {
  const refusal = (extra: object = {}) =>
    new ApiError({
      data: {
        code: 'ListInvoiceLineReports.OutsideRetention',
        status: 422,
        ...extra,
      },
      status: 422,
    });

  it('is not an alert: the usage was purged on purpose', () => {
    render(
      <OutsideRetentionNotice error={refusal()} ledger={line().metering?.ledger} />,
    );

    expect(
      screen.getByText('What the invoice kept'),
    ).toBeInTheDocument();
  });

  it('says where the usage that is kept begins, when the API says', () => {
    render(
      <OutsideRetentionNotice
        error={refusal({
          errors: [{ value: { retentionStart: '2026-04-01T00:00:00.000Z' } }],
        })}
        ledger={line().metering?.ledger}
      />,
    );

    expect(
      screen.getByText('Usage before Apr 1, 2026 (UTC) is no longer kept.'),
    ).toBeInTheDocument();
  });

  it('shows the explanation alone for a line that has no fingerprint', () => {
    render(<OutsideRetentionNotice error={refusal()} />);

    expect(screen.queryByTestId('line-fingerprint')).toBeNull();
    expect(
      screen.getByText('The reports of this line are no longer kept'),
    ).toBeInTheDocument();
  });
});
