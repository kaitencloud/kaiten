import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { storyInvoicePreview } from '@/test-fixtures/storybook-billing-fixtures';
import {
  InvoiceLinesTable,
  InvoicePreviewDialog,
  InvoicePreviewResult,
  InvoiceTotals,
} from '..';

const meta = {
  title: 'Domains/Billing/InvoicePreview',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// The preview of an invoice as the API composed it: a line per concern with
// its period and the arithmetic in the API's own words, and the totals as the
// API states them (the lines add up to 4319 here, and so does the API's total).
export const Result: Story = {
  render: () => (
    <div className="max-w-3xl">
      <InvoicePreviewResult preview={storyInvoicePreview} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Traces, overage')).toBeVisible();
    await expect(canvas.getByText('$5.79')).toBeVisible();
    await expect(canvas.getByText('Capped')).toBeVisible();
    await expect(canvas.getByText(/^Renewal invoice, composed /)).toBeVisible();
    await expect(canvas.getAllByText('Mar 1 – Apr 1, 2027 (UTC)')).toHaveLength(3);
    await expect(canvas.getAllByText('$43.19')).toHaveLength(2);
  },
};

// A discount is a negative line and a negative total, in the API's figures.
export const WithDiscount: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-4">
      <InvoiceLinesTable
        currency="USD"
        lines={[
          { ...storyInvoicePreview.lines[2] },
          {
            amount: -580,
            description: 'LAUNCH: 20% off the base',
            label: 'LAUNCH',
            quantity: '1',
            seq: 4,
            serviceFrom: '2027-03-01T00:00:00Z',
            serviceTo: '2027-04-01T00:00:00Z',
            type: 'DISCOUNT',
          },
        ]}
      />
      <InvoiceTotals
        currency="USD"
        discountTotal={580}
        subtotal={2900}
        total={2320}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Discount')).toBeVisible();
    await expect(canvas.getAllByText('−$5.80')).toHaveLength(2);
    await expect(canvas.getByText('$23.20')).toBeVisible();
  },
};

const onOpenChange = fn();

// The modal a preview opens in: the banner says it is not an invoice, there is
// no Save, and closing is the only action.
export const Dialog: Story = {
  render: () => (
    <InvoicePreviewDialog
      description="Pro v2 · renewal at a boundary now"
      onOpenChange={onOpenChange}
      open
      title="Invoice preview"
    >
      <InvoicePreviewResult preview={storyInvoicePreview} />
    </InvoicePreviewDialog>
  ),
  play: async () => {
    const dialog = within(await within(document.body).findByRole('dialog'));

    // The dialog fades in: what it holds is there before it is opaque.
    await expect(dialog.getByText('Preview, not an invoice')).toBeInTheDocument();
    await expect(dialog.getByText('Traces, overage')).toBeInTheDocument();
    await expect(dialog.queryByRole('button', { name: 'Save' })).toBeNull();
    await userEvent.click(dialog.getAllByRole('button', { name: 'Close' })[0]);
    await expect(onOpenChange).toHaveBeenCalledWith(false);
  },
};
