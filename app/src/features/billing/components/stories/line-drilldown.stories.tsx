import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { InvoiceLine, UsageReport } from '@/api-client';
import { ApiError } from '@/lib/errors';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import {
  buildInvoiceLine,
  buildUsageReport,
} from '@/test-fixtures/storybook-billing-fixtures';
import { LineSummaryCard } from '../line-drilldown/line-summary-card';
import { OutsideRetentionNotice } from '../line-drilldown/outside-retention-notice';
import { UsageWindowCard } from '../line-drilldown/usage-window-card';
import {
  getLimitChangeSeqs,
  groupReportsByWindow,
} from '../../utils/usage-windows';

const meta = {
  title: 'Features/Billing/LineDrilldown',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const WINDOW = {
  windowEnd: '2027-04-01T00:00:00.000Z',
  windowStart: '2027-03-01T00:00:00.000Z',
};

const reports: UsageReport[] = [
  buildUsageReport({
    delta: '38000',
    limitValue: '100000',
    overageDelta: '0',
    reportSeq: 301,
    reportedAt: '2027-03-02T04:00:00.000Z',
    reportedValue: '38000',
    valueAfter: '38000',
    valueBefore: '0',
    ...WINDOW,
  }),
  buildUsageReport({
    delta: '31500',
    limitValue: '100000',
    overageDelta: '0',
    reportSeq: 302,
    reportedAt: '2027-03-07T08:00:00.000Z',
    reportedValue: '31500',
    valueAfter: '69500',
    valueBefore: '38000',
    ...WINDOW,
  }),
  // An add-on raised the limit here: the row that explains why the overage is
  // not the usage minus the limit of the day.
  buildUsageReport({
    delta: '45000',
    limitValue: '150000',
    overageDelta: '0',
    reportSeq: 303,
    reportedAt: '2027-03-12T12:00:00.000Z',
    reportedValue: '45000',
    valueAfter: '114500',
    valueBefore: '69500',
    ...WINDOW,
  }),
  buildUsageReport({
    delta: '40000',
    limitValue: '150000',
    overageDelta: '4500',
    reportSeq: 304,
    reportedAt: '2027-03-17T16:00:00.000Z',
    reportedValue: '40000',
    valueAfter: '154500',
    valueBefore: '114500',
    ...WINDOW,
  }),
];

const overageLine: InvoiceLine = buildInvoiceLine({
  amount: 450,
  description: '4,500 × $0.001 per call',
  entitlementId: 'ent-1',
  entitlementSlug: 'api-calls',
  invoiceId: 'inv-1',
  label: 'API calls, overage',
  metering: {
    ledger: {
      firstSeq: 301,
      lastSeq: 304,
      rows: 4,
      sumDelta: '154500',
      sumOverage: '4500',
    },
    measuredQuantity: '4500',
    negativeSegmentsFloored: 0,
    saleUnitFactor: '1',
    windows: 1,
  },
  overage: {
    limits: [
      { limitValue: '100000', overagePercent: 0, rows: 2 },
      { limitValue: '150000', overagePercent: 0, rows: 2 },
    ],
    overageMeasured: '4500',
    usageMeasured: '154500',
  },
  quantity: '4500',
  seq: 1,
  serviceFrom: WINDOW.windowStart,
  serviceTo: WINDOW.windowEnd,
  type: 'OVERAGE',
});

const [window] = groupReportsByWindow(reports);
const limitChanges = getLimitChangeSeqs(reports);

// A reset window and the reports that counted in it, with the sum next to the
// line's quantity. The report where the limit in force changed is marked in
// words, not by colour alone.
export const Window: Story = {
  render: () => (
    <UsageWindowCard
      isPartial={false}
      limitChanges={limitChanges}
      measuresOverage
      window={window}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Mar 1 – Apr 1, 2027 (UTC)')).toBeVisible();
    await expect(canvas.getByTestId('usage-window-sum')).toHaveTextContent(
      '4 reports · overage 4,500',
    );
    await expect(canvas.getAllByText('Limit changed')).toHaveLength(1);
    await expect(canvas.getByText('0 → 38,000')).toBeVisible();
  },
};

// More reports follow: the sum of the window is not whole, so it is not given.
export const WindowContinuesOnTheNextPage: Story = {
  render: () => (
    <UsageWindowCard
      isPartial
      limitChanges={limitChanges}
      measuresOverage={false}
      window={window}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('4 reports so far · more to load'),
    ).toBeVisible();
  },
};

export const LineSummary: Story = {
  render: () => (
    <div className="max-w-2xl">
      <LineSummaryCard invoice={{ currency: 'USD' }} line={overageLine} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Measured quantity')).toBeVisible();
    await expect(canvas.getByTestId('line-fingerprint')).toHaveTextContent(
      'Reports 301–304 · 4 rows · Σ 154,500',
    );
    await expect(canvas.getByTestId('overage-limits')).toHaveTextContent(
      'Limit 150,000',
    );
  },
};

// The usage is purged after the retention, and the API refuses to list it. The
// invoice kept a fingerprint, and that is what is left to read.
export const ReportsNoLongerKept: Story = {
  render: () => (
    <StorybookRouter>
      <div className="max-w-2xl">
        <OutsideRetentionNotice
          error={
            new ApiError({
              data: { code: 'ListInvoiceLineReports.OutsideRetention', status: 422 },
              status: 422,
            })
          }
          ledger={overageLine.metering?.ledger}
        />
      </div>
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText('The reports of this line are no longer kept'),
    ).toBeVisible();
    await expect(canvas.getByTestId('line-fingerprint')).toBeVisible();
  },
};
