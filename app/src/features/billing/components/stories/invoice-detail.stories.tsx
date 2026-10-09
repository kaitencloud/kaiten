import type { Meta, StoryObj } from '@storybook/react-vite';
import { Suspense } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Invoice } from '@/api-client';
import { handleGetInvoice } from '@/api-client/msw.gen';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import {
  buildInvoice,
  buildInvoiceLine,
} from '@/test-fixtures/storybook-billing-fixtures';
import { HoldBanner } from '../invoice-detail/hold-banner';
import { InvoiceActionButtons } from '../invoice-detail/invoice-action-buttons';
import { InvoiceDetailPage } from '../invoice-detail/invoice-detail-page';
import { InvoiceDetailStats } from '../invoice-detail/invoice-detail-stats';
import { InvoiceHandoffBlock } from '../invoice-detail/invoice-handoff-block';
import { InvoiceSummaryCard } from '../invoice-detail/invoice-summary-card';

const meta = {
  title: 'Features/Billing/InvoiceDetail',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const BOUNDARY = '2027-03-01T00:00:00.000Z';

const line = buildInvoiceLine({
  amount: 12900,
  description: '1 × $129.00 per month',
  invoiceId: 'inv-1',
  label: 'Pro, monthly',
  seq: 1,
  serviceFrom: BOUNDARY,
  serviceTo: '2027-04-01T00:00:00.000Z',
  type: 'BASE',
});

const held = buildInvoice({
  boundaryAt: BOUNDARY,
  holdDetail: {
    pairs: [
      {
        counterReportSeq: 44,
  detail: 'the reports should go on at 45, and the next one is 44',
        entitlementId: 'ent-1',
        expected: '45',
        firstSeq: 41,
        found: '44',
        instanceId: 'ins-1',
        invariant: 'LEDGER_SEQUENCE_GAP',
        lastSeq: 45,
  reportSeq: 44,
      },
    ],
  },
  holdReason: 'LEDGER_SEQUENCE_GAP',
  id: 'inv-1',
  lines: [{ ...line, entitlementId: 'ent-1', entitlementSlug: 'api-calls' }],
  status: 'DRAFT',
});

// Why a draft is held, in words, with the meters that failed and what each way
// out does under the provider of the invoice.
export const Held: Story = {
  render: () => (
    <div className="max-w-3xl">
      <HoldBanner invoice={held} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText('Held: Usage reports are missing from the journal'),
    ).toBeVisible();
    await expect(canvas.getByText('api-calls')).toBeVisible();
    await expect(canvas.getByText('41–45')).toBeVisible();
  },
};

const onRun = fn();

// The actions an invoice offers: the first is where the status leads, and one
// the screen knows would be refused is shown disabled, with why.
export const Actions: Story = {
  render: () => (
    <InvoiceActionButtons
      onRun={onRun}
      states={[
        { action: 'releaseHold' },
        { action: 'recompose', unavailable: { reason: 'instance-deleted' } },
        { action: 'void' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = within(await canvas.findByTestId('invoice-actions'));

    await expect(buttons.getByRole('button', { name: 'Recompose' })).toBeDisabled();
    await userEvent.click(buttons.getByRole('button', { name: 'Release the hold' }));
    await expect(onRun).toHaveBeenCalledWith('releaseHold');
  },
};

// Where an invoice stands in the chain of replacements, as rows of its summary: a
// recomposed invoice points to its replacement, which points back at it.
export const ReplacementChain: Story = {
  render: () => (
    <StorybookRouter>
      <div className="max-w-sm">
        <InvoiceSummaryCard
          invoice={{
            ...held,
            replacedByInvoiceId: 'inv-2',
            replacesInvoiceId: 'inv-0',
          }}
        />
      </div>
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('link', { name: 'inv-2' })).toHaveAttribute(
      'href',
      '/invoices/inv-2',
    );
    await expect(canvas.getByRole('link', { name: 'inv-0' })).toBeVisible();
    await expect(canvas.getByText('Replaces')).toBeVisible();
    await expect(canvas.getByText('Replaced by')).toBeVisible();
  },
};

export const HandoffWaiting: Story = {
  render: () => (
    <div className="max-w-sm">
      <InvoiceHandoffBlock
        invoice={buildInvoice({
          boundaryAt: BOUNDARY,
          handoff: {
            claimCount: 2,
            leaseId: 'lease-1',
            leasedUntil: '2099-01-01T00:00:00.000Z',
            status: 'PENDING',
          },
          id: 'inv-1',
          lines: [line],
        })}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Reserved until/),
    ).toBeVisible();
  },
};

export const HandoffAcknowledged: Story = {
  render: () => (
    <div className="max-w-sm">
      <InvoiceHandoffBlock
        invoice={buildInvoice({
          boundaryAt: BOUNDARY,
          handoff: {
            acknowledgedAt: '2027-03-05T09:00:00.000Z',
            claimCount: 1,
            externalReference: 'ERP-1042',
            status: 'ACKNOWLEDGED',
          },
          id: 'inv-1',
          lines: [line],
        })}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('ERP-1042')).toBeVisible();
  },
};

export const Summary: Story = {
  render: () => (
    <div className="max-w-sm">
      <InvoiceSummaryCard
        invoice={buildInvoice({
          boundaryAt: BOUNDARY,
          hold: {
            releaseReason: 'Counter verified by hand',
            releasedAt: '2027-03-04T09:00:00.000Z',
            releasedBy: 'user-1',
          },
          id: 'inv-1',
          lines: [line],
        })}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Summary')).toBeVisible();
    await expect(canvas.getByText('Payment terms')).toBeVisible();
    await expect(canvas.getByText('30 days')).toBeVisible();
    await expect(canvas.getByText(/Counter verified by hand/)).toBeVisible();
  },
};

// An invoice that ended keeps the day it had fallen due in its summary: the strip
// above it says when it ended, and no longer when it was due.
export const SummaryEnded: Story = {
  render: () => (
    <div className="max-w-sm">
      <InvoiceSummaryCard
        invoice={buildInvoice({
          boundaryAt: BOUNDARY,
          id: 'inv-1',
          lines: [line],
          paidAt: '2027-03-18T10:30:00.000Z',
          status: 'PAID',
        })}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Due')).toBeVisible();
    await expect(canvas.getByText('Mar 31, 2027 (UTC)')).toBeVisible();
    await expect(canvas.queryByText(/Mar 18, 2027/)).toBeNull();
  },
};

// A draft says since when it is held, which the banner does not.
export const SummaryHeld: Story = {
  render: () => (
    <div className="max-w-sm">
      <InvoiceSummaryCard
        invoice={buildInvoice({
          boundaryAt: BOUNDARY,
          hold: { heldAt: '2027-03-02T08:15:00.000Z' },
          holdReason: 'LEDGER_SEQUENCE_GAP',
          id: 'inv-1',
          lines: [line],
          status: 'DRAFT',
        })}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Held since')).toBeVisible();
    await expect(canvas.getByText('Mar 2, 2027, 8:15 AM (UTC)')).toBeVisible();
    await expect(canvas.queryByText('Issued')).toBeNull();
  },
};

// --- The three figures under the header ---------------------------------------

// Midday UTC on the 20th, so that "overdue" and "in N days" read the same on every run.
const NOW = Date.parse('2027-03-20T12:00:00.000Z');

const figures = (invoice: Invoice) => (
  <div className="max-w-5xl">
    <InvoiceDetailStats invoice={invoice} now={NOW} />
  </div>
);

const labelled = (canvasElement: HTMLElement, label: string) =>
  within(canvasElement).getByText(label, {
    selector: '[data-slot="stat-card-label"]',
  });

// The total as the API states it, the day the invoice is due and how far away it is,
// and the period its lines bill under the kind of invoice it is.
export const FiguresToBePaid: Story = {
  render: () =>
    figures(
      buildInvoice({
        boundaryAt: BOUNDARY,
        dueAt: '2027-03-31T00:04:00.000Z',
        id: 'inv-1',
        issuedAt: '2027-03-17T00:04:00.000Z',
        lines: [line],
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('$129.00')).toBeVisible();
    await expect(canvas.getByText('1 line')).toBeVisible();
    await expect(canvas.getByText('Mar 31, 2027')).toBeVisible();
    await expect(canvas.getByText('in 11 days')).toBeVisible();
    // The period is two pieces, one for each date, that wrap after the dash.
    await expect(canvas.getByText('Mar 1 –')).toBeVisible();
    await expect(canvas.getByText('Apr 1, 2027')).toBeVisible();
    await expect(canvas.getByText('Renewal')).toBeVisible();
  },
};

// Past its due date and unpaid: the date and how long it has been missed take the
// tone of an alert, as the badge of the title does.
export const FiguresOverdue: Story = {
  render: () =>
    figures(
      buildInvoice({
        boundaryAt: BOUNDARY,
        dueAt: '2027-03-10T00:04:00.000Z',
        id: 'inv-1',
        issuedAt: '2027-02-08T00:04:00.000Z',
        lines: [line],
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('overdue for 10 days')).toBeVisible();
    await expect(canvas.getByText('overdue for 10 days')).toHaveClass(
      'text-destructive-subtle-foreground',
    );
  },
};

// A draft was not issued, held or not: it has no due date, and the card says so in
// a word that is not a figure.
export const FiguresNotIssued: Story = {
  render: () =>
    figures(
      buildInvoice({
        boundaryAt: BOUNDARY,
        holdReason: 'LEDGER_SEQUENCE_GAP',
        id: 'inv-1',
        lines: [line],
        status: 'DRAFT',
      }),
    ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Not issued')).toBeVisible();
  },
};

// An invoice that ended is no longer due: the card says when it ended, the day and
// under it the time of day, since the state itself is the badge of the title.
export const FiguresPaid: Story = {
  render: () =>
    figures(
      buildInvoice({
        boundaryAt: BOUNDARY,
        id: 'inv-1',
        lines: [line],
        paidAt: '2027-03-18T10:30:00.000Z',
        status: 'PAID',
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Mar 18, 2027')).toBeVisible();
    await expect(canvas.getByText('10:30 AM (UTC)')).toBeVisible();
    await expect(labelled(canvasElement, 'Paid')).toBeVisible();
  },
};

// A period of a year is too long for a third of a narrow strip: it wraps after its
// dash, each date whole, and the zone stays with the last one.
export const FiguresYear: Story = {
  render: () => (
    <div className="max-w-xl">
      <InvoiceDetailStats
        invoice={buildInvoice({
          boundaryAt: BOUNDARY,
          dueAt: '2027-03-31T00:04:00.000Z',
          id: 'inv-1',
          issuedAt: '2027-03-17T00:04:00.000Z',
          kind: 'ACTIVATION',
          lines: [
            {
              ...line,
              serviceFrom: BOUNDARY,
              serviceTo: '2028-03-01T00:00:00.000Z',
            },
          ],
        })}
        now={NOW}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText(/Mar 1, 2027/)).toBeVisible();
    await expect(canvas.getByText(/Mar 1, 2028/)).toBeVisible();
    await expect(canvas.getByText('Activation')).toBeVisible();
  },
};

// --- The whole page ------------------------------------------------------------

// Far enough back to be always past due.
const PAST_DUE = '2020-03-31T00:00:00.000Z';

const overageLine = buildInvoiceLine({
  amount: 1250,
  description: '125,000 × $0.01 per call',
  entitlementId: 'ent-1',
  entitlementSlug: 'api-calls',
  invoiceId: 'inv-page',
  label: 'API calls, overage',
  metering: {
    ledger: {
      firstSeq: 41,
      lastSeq: 45,
      rows: 5,
      sumDelta: '245400',
      sumOverage: '125000',
    },
    measuredQuantity: '125000',
    negativeSegmentsFloored: 0,
    saleUnitFactor: '1',
    windows: 1,
  },
  overage: {
    limits: [{ limitValue: '120000', overagePercent: 100, rows: 5 }],
    overageMeasured: '125000',
    usageMeasured: '245400',
  },
  quantity: '125000',
  seq: 1,
  serviceFrom: '2027-02-01T00:00:00.000Z',
  serviceTo: BOUNDARY,
  type: 'OVERAGE',
  unitAmountDecimal: '1',
});

const baseLine = buildInvoiceLine({
  amount: 25000,
  description: '1 × $250.00 per month',
  invoiceId: 'inv-page',
  label: 'Enterprise, monthly',
  seq: 2,
  serviceFrom: BOUNDARY,
  serviceTo: '2027-04-01T00:00:00.000Z',
  type: 'BASE',
});

const renderPage = (invoice: Invoice) => (
  <StorybookRouter>
    <div className="h-screen">
      <Suspense fallback={null}>
        <InvoiceDetailPage invoiceId={invoice.id} />
      </Suspense>
    </div>
  </StorybookRouter>
);

const card = (canvasElement: HTMLElement, title: string) =>
  within(canvasElement)
    .getByText(title, { selector: '[data-slot="card-title"]' })
    .closest<HTMLElement>('[data-slot="card"]') as HTMLElement;

// An invoice waiting for the accounting system that replaces a void one and is
// overdue: the strip, then the summary, who it is billed to and the handoff in one
// row of cards aligned at the top, then the lines across the page.
const overdueInvoice = buildInvoice({
  boundaryAt: BOUNDARY,
  dueAt: PAST_DUE,
  handoff: { claimCount: 1, status: 'PENDING' },
  id: 'inv-page',
  issuedAt: '2020-03-01T00:00:00.000Z',
  lines: [overageLine, baseLine],
  replacesInvoiceId: 'inv-page-voided',
});

export const PageOverdue: Story = {
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: [handleGetInvoice({ body: overdueInvoice })] },
  },
  render: () => renderPage(overdueInvoice),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { level: 1 })).toBeVisible();
    for (const label of ['Total', 'Due', 'Service period']) {
      await expect(labelled(canvasElement, label)).toBeVisible();
    }
    await expect(canvas.getByRole('link', { name: 'inv-page-voided' })).toBeVisible();
    await expect(canvas.getByTestId('invoice-handoff')).toBeVisible();
    // Two rows of the grid at this width, each aligned at the top.
    await expect(
      card(canvasElement, 'Summary').getBoundingClientRect().top,
    ).toBeCloseTo(card(canvasElement, 'Billed to').getBoundingClientRect().top, 0);
    // The lines have the width of the page, not of a column.
    await expect(
      card(canvasElement, 'Lines').getBoundingClientRect().width,
    ).toBeGreaterThan(card(canvasElement, 'Summary').getBoundingClientRect().width);
  },
};

// A held draft: the banner is an alert under the strip, nothing was issued so the
// invoice is in no queue, and the row holds the two cards that remain.
const heldInvoice = buildInvoice({
  boundaryAt: BOUNDARY,
  hold: { heldAt: '2027-03-02T08:15:00.000Z' },
  holdDetail: held.holdDetail,
  holdReason: 'LEDGER_SEQUENCE_GAP',
  id: 'inv-page',
  lines: [overageLine, baseLine],
  status: 'DRAFT',
});

export const PageHeld: Story = {
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: [handleGetInvoice({ body: heldInvoice })] },
  },
  render: () => renderPage(heldInvoice),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('hold-banner')).toBeVisible();
    await expect(canvas.getByText('Not issued')).toBeVisible();
    await expect(canvas.getByText('Held since')).toBeVisible();
    await expect(canvas.queryByTestId('invoice-handoff')).toBeNull();
    // Side by side from the same top, each card ending with its content.
    await expect(
      card(canvasElement, 'Summary').getBoundingClientRect().top,
    ).toBeCloseTo(card(canvasElement, 'Billed to').getBoundingClientRect().top, 0);
  },
};
