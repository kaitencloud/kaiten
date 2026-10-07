import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { DeletionRefusalDialog } from '..';

const meta = {
  title: 'Domains/Billing/DeletionRefusal',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const onClose = fn();

const openDialog = async () =>
  within(await within(document.body).findByRole('dialog'));

// An instance whose subscription still runs: its status, where to open it, and
// the explanation of the API as it wrote it.
export const InstanceWithALiveSubscription: Story = {
  render: () => (
    <StorybookRouter>
      <DeletionRefusalDialog
        onClose={onClose}
        refusal={{
          detail:
            'Instance "acme-production" is billed: cancel its subscription and settle its invoices first',
          kind: 'instance',
          status: 'ACTIVE',
          unpaidInvoiceIds: [],
        }}
        slug="acme-production"
      />
    </StorybookRouter>
  ),
  play: async () => {
    const dialog = await openDialog();

    await expect(dialog.getByText('This instance cannot be deleted')).toBeInTheDocument();
    await expect(dialog.getByText('Active')).toBeInTheDocument();
    await expect(dialog.getByText('The subscription is still running.')).toBeInTheDocument();
    await expect(dialog.getByRole('link', { name: 'Open the subscription' })).toBeInTheDocument();
    await expect(dialog.queryByTestId('deletion-refusal-invoices')).toBeNull();
    await userEvent.click(dialog.getAllByRole('button', { name: 'Close' })[0]);
    await expect(onClose).toHaveBeenCalled();
  },
};

// A subscription that ended, with the invoices that are still to settle, each
// leading to the invoice.
export const InstanceWithInvoicesToSettle: Story = {
  render: () => (
    <StorybookRouter>
      <DeletionRefusalDialog
        onClose={onClose}
        refusal={{
          kind: 'instance',
          status: 'CANCELED',
          unpaidInvoiceIds: ['inv-legacy-open', 'inv-legacy-final'],
        }}
        slug="acme-legacy"
      />
    </StorybookRouter>
  ),
  play: async () => {
    const dialog = await openDialog();

    await expect(dialog.getByText('Canceled')).toBeInTheDocument();
    await expect(
      dialog.getByText('The subscription has ended, but some of its invoices are not settled.'),
    ).toBeInTheDocument();
    await expect(dialog.getByText('2 invoices not settled')).toBeInTheDocument();
    await expect(dialog.getByRole('link', { name: 'inv-legacy-open' })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-legacy-open',
    );
    // With no explanation of the API, the console says it in its own words.
    await expect(
      dialog.getByText('Billing still depends on this instance, so it was kept. Nothing was deleted.'),
    ).toBeInTheDocument();
  },
};

export const CustomerWithNoSubscriptionLeft: Story = {
  render: () => (
    <StorybookRouter>
      <DeletionRefusalDialog
        onClose={onClose}
        refusal={{ kind: 'customer', live: false, unpaidInvoiceIds: ['inv-gamma-open'] }}
        slug="gamma-labs"
      />
    </StorybookRouter>
  ),
  play: async () => {
    const dialog = await openDialog();

    await expect(dialog.getByText('This customer cannot be deleted')).toBeInTheDocument();
    await expect(
      dialog.getByText('None of its subscriptions is running, but some invoices are not settled.'),
    ).toBeInTheDocument();
    await expect(dialog.getByText('1 invoice not settled')).toBeInTheDocument();
  },
};

// What still grants, counts or prices the entitlement: only the kinds there is at
// least one of, counted, and singular where there is one.
export const EntitlementInUse: Story = {
  render: () => (
    <StorybookRouter>
      <DeletionRefusalDialog
        onClose={onClose}
        refusal={{
          kind: 'entitlement',
          references: [
            { count: 2, key: 'licenseGrants' },
            { count: 1, key: 'usageCounters' },
            { count: 3, key: 'licensePrices' },
          ],
        }}
        slug="api-calls"
      />
    </StorybookRouter>
  ),
  play: async () => {
    const dialog = await openDialog();
    const references = within(dialog.getByTestId('deletion-refusal-references'));

    await expect(dialog.getByText('This entitlement cannot be deleted')).toBeInTheDocument();
    await expect(references.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Granted by 2 license versions',
      'Usage recorded on 1 instance',
      'Metered by 3 license prices',
    ]);
    await expect(dialog.getByRole('link', { name: 'Open the entitlement' })).toBeInTheDocument();
    // A price keeps it for good: the dialog offers to hide it instead of asking for
    // what cannot be done.
    await expect(
      dialog.getByText(/turn off “User facing” on its page/),
    ).toBeInTheDocument();
    await expect(
      dialog.queryByText('Remove these references, then delete the entitlement again.'),
    ).toBeNull();
  },
};

// What can be taken away is asked to be: a counter on an instance goes with the
// instance, a grant with the license that gives it.
export const EntitlementHeldByWhatCanBeRemoved: Story = {
  render: () => (
    <StorybookRouter>
      <DeletionRefusalDialog
        onClose={onClose}
        refusal={{
          kind: 'entitlement',
          references: [{ count: 1, key: 'licenseGrants' }],
        }}
        slug="seats"
      />
    </StorybookRouter>
  ),
  play: async () => {
    const dialog = await openDialog();

    await expect(
      dialog.getByText('Remove these references, then delete the entitlement again.'),
    ).toBeInTheDocument();
    await expect(dialog.queryByText(/turn off “User facing”/)).toBeNull();
  },
};
