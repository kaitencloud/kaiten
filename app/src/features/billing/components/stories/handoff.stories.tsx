import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { QueuedInvoice } from '@/api-client';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { HandoffEmpty } from '../handoff/handoff-empty';
import { HandoffTable } from '../handoff/handoff-table';

const meta = {
  title: 'Features/Billing/Handoff',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const queued = (overrides: Partial<QueuedInvoice>): QueuedInvoice => ({
  boundaryAt: '2027-03-01T00:00:00.000Z',
  collectionMethod: 'SEND_INVOICE',
  createdAt: '2027-03-01T00:00:00.000Z',
  currency: 'USD',
  customerName: 'Initech',
  customerSlug: 'initech',
  discountTotal: 0,
  handoff: { claimCount: 0, status: 'PENDING' },
  handoffStatus: 'PENDING',
  id: 'inv-1',
  instanceName: 'Initech Production',
  instanceSlug: 'initech-production',
  issuedAt: '2027-03-02T00:00:00.000Z',
  kind: 'RENEWAL',
  licenseSlug: 'pro-v2',
  providerKind: 'NOOP',
  serviceFrom: '2027-02-01T00:00:00.000Z',
  serviceTo: '2027-03-01T00:00:00.000Z',
  status: 'MANUAL',
  subtotal: 12900,
  total: 12900,
  updatedAt: '2027-03-02T00:00:00.000Z',
  ...overrides,
});

const WAITING: QueuedInvoice[] = [
  queued({ id: 'inv-1' }),
  queued({
    customerName: 'Globex',
    handoff: {
      claimCount: 2,
      leaseId: 'lease-1',
      leasedUntil: '2099-01-01T00:00:00.000Z',
      status: 'PENDING',
    },
    id: 'inv-2',
    instanceSlug: 'globex-production',
    issuedAt: '2027-03-05T00:00:00.000Z',
  }),
];

const onAcknowledge = fn();

// What waits for the accounting system, oldest first: how many times a consumer
// has taken each invoice and, while a lease is running, until when it holds it.
// A person acknowledges an invoice they booked themselves; there is no claim.
export const Waiting: Story = {
  render: () => (
    <StorybookRouter>
      <HandoffTable
        invoices={WAITING}
        onAcknowledge={onAcknowledge}
        status="PENDING"
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Reserved until Jan 1, 2099, 12:00 AM (UTC)')).toBeVisible();
    await expect(canvas.getByText('2 claims')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /claim/i })).toBeNull();

    await userEvent.click(canvas.getAllByRole('button', { name: 'Acknowledge' })[0]);
    await expect(onAcknowledge).toHaveBeenCalledTimes(1);
  },
};

// Voiding or writing an invoice off leaves a handoff that was pending pending, so
// the queue can hold an invoice that is no longer to be collected: its status says
// so, and its consumer sees it as such.
export const VoidInvoiceStillWaiting: Story = {
  render: () => (
    <StorybookRouter>
      <HandoffTable
        invoices={[
          queued({ id: 'inv-1' }),
          queued({ customerName: 'Globex', id: 'inv-2', status: 'VOID' }),
          queued({
            customerName: 'Hooli',
            id: 'inv-3',
            status: 'UNCOLLECTIBLE',
          }),
        ]}
        status="PENDING"
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Ready to bill')).toBeVisible();
    await expect(canvas.getByText('Void')).toBeVisible();
    await expect(canvas.getByText('Written off')).toBeVisible();
  },
};

export const Acknowledged: Story = {
  render: () => (
    <StorybookRouter>
      <HandoffTable
        invoices={[
          queued({
            handoff: {
              acknowledgedAt: '2027-03-05T09:00:00.000Z',
              claimCount: 1,
              externalReference: 'ERP-1042',
              status: 'ACKNOWLEDGED',
            },
            handoffStatus: 'ACKNOWLEDGED',
          }),
        ]}
        status="ACKNOWLEDGED"
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('ERP-1042')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  },
};

// An empty queue is the normal state, and says how it is read: invoices wait for
// a job or a terminal, which claims them with a command.
export const NothingWaiting: Story = {
  render: () => <HandoffEmpty status="PENDING" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Nothing is waiting for your ERP')).toBeVisible();
    await expect(canvas.getByText('kaiten billing handoff claim')).toBeVisible();
  },
};

export const NothingAcknowledged: Story = {
  render: () => <HandoffEmpty status="ACKNOWLEDGED" />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Nothing acknowledged yet'),
    ).toBeVisible();
  },
};
