import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { InvoiceSummary } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleListInvoices,
} from '@/api-client/msw.gen';
import { billingCapabilitiesProfiles } from '@/test-fixtures/storybook-billing-fixtures';
import { storyCustomers } from '@/test-fixtures/storybook-fixtures';
import { onePage } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { CustomerDetailsCard } from '../customer-detail/customer-details-card';
import { CustomerInvoicesCard } from '../customer-detail/customer-invoices-card';

const meta = {
  title: 'Features/Customers/Billing',
  parameters: {
    layout: 'padded',
    msw: {
      handlers: [
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.stack(),
        }),
      ],
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const [acme] = storyCustomers;

// Where billing is on, the details of a customer say where its invoices are sent.
export const BillingEmailSet: Story = {
  render: () => (
    <StorybookRouter>
      <CustomerDetailsCard
        customer={{ ...acme, billingEmail: 'ap@acme.test' }}
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Billing e-mail')).toBeVisible();
    await expect(canvas.getByText('ap@acme.test')).toBeVisible();
  },
};

export const BillingEmailNotSet: Story = {
  render: () => (
    <StorybookRouter>
      <CustomerDetailsCard customer={acme} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Billing e-mail')).toBeVisible();
    await expect(canvas.getByText('Not set')).toBeVisible();
  },
};

// Where billing is off, nothing of it shows: the row is absent, not empty.
export const BillingOff: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.disabled(),
        }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <CustomerDetailsCard
        customer={{ ...acme, billingEmail: 'ap@acme.test' }}
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Domain')).toBeVisible();
    await expect(canvas.queryByText('Billing e-mail')).toBeNull();
  },
};

const invoice = (id: string, total: number): InvoiceSummary => ({
  boundaryAt: '2027-03-01T00:00:00.000Z',
  collectionMethod: 'SEND_INVOICE',
  createdAt: '2027-03-01T00:00:00.000Z',
  currency: 'USD',
  customerName: acme.name,
  customerSlug: acme.slug,
  discountTotal: 0,
  dueAt: '2099-03-31T00:00:00.000Z',
  handoffStatus: 'PENDING',
  id,
  instanceName: 'Acme Production',
  instanceSlug: 'acme-production',
  issuedAt: '2027-03-01T00:00:00.000Z',
  kind: 'RENEWAL',
  licenseSlug: 'pro-v2',
  providerKind: 'NOOP',
  serviceFrom: '2027-02-01T00:00:00.000Z',
  serviceTo: '2027-03-01T00:00:00.000Z',
  status: 'MANUAL',
  subtotal: total,
  total,
  updatedAt: '2027-03-01T00:00:00.000Z',
});

// The invoices of a customer, across its instances.
export const Invoices: Story = {
  parameters: {
    msw: {
      handlers: [
        handleListInvoices(onePage([invoice('inv-1', 12900), invoice('inv-2', 4900)])),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <CustomerInvoicesCard customerSlug={acme.slug} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('$129.00')).toBeVisible();
    await expect(canvas.getByText('$49.00')).toBeVisible();
  },
};

export const NoInvoiceYet: Story = {
  parameters: { msw: { handlers: [handleListInvoices(onePage([]))] } },
  render: () => (
    <StorybookRouter>
      <CustomerInvoicesCard customerSlug={acme.slug} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByTestId('customer-invoices-empty'),
    ).toBeVisible();
  },
};
