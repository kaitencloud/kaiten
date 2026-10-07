import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import {
  buildInvoice,
  buildInvoiceLine,
} from '@/test-fixtures/storybook-billing-fixtures';
import { HoldBanner } from '../invoice-detail/hold-banner';
import { InvoiceActionButtons } from '../invoice-detail/invoice-action-buttons';
import { InvoiceChain } from '../invoice-detail/invoice-chain';
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
        entitlementId: 'ent-1',
        expected: '45',
        firstSeq: 41,
        found: '44',
        instanceId: 'ins-1',
        invariant: 'LEDGER_SEQUENCE_GAP',
        lastSeq: 45,
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

export const ReplacementChain: Story = {
  render: () => (
    <StorybookRouter>
      <InvoiceChain
        invoice={{ ...held, replacedByInvoiceId: 'inv-2', replacesInvoiceId: 'inv-0' }}
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('link', { name: 'inv-2' })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-2',
    );
    await expect(canvas.getByRole('link', { name: 'inv-0' })).toBeVisible();
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
    await expect(canvas.getByText(/30 days to pay/)).toBeVisible();
    await expect(canvas.getByText(/Counter verified by hand/)).toBeVisible();
  },
};
