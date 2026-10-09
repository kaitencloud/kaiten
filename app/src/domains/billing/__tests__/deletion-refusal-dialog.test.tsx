import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import { DeletionRefusalDialog } from '../components';
import type { DeletionRefusal } from '../logic';

vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

const instance: DeletionRefusal = {
  kind: 'instance',
  status: 'ACTIVE',
  unpaidInvoiceIds: ['inv-1', 'inv-2'],
};

describe('the dialog of a refused deletion', () => {
  it('says that nothing was deleted, with the subscription and the invoices in the way', () => {
    render(
      <DeletionRefusalDialog
        onClose={vi.fn()}
        refusal={instance}
        slug="acme-production"
      />,
    );

    const dialog = screen.getByRole('dialog', {
      name: 'This instance cannot be deleted',
    });
    expect(dialog).toHaveTextContent('Nothing was deleted.');
    expect(within(dialog).getByText('Active')).toBeInTheDocument();
    expect(
      within(dialog).getByText('The subscription is still running.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Open the subscription' }),
    ).toHaveAttribute('href', '/customers/instances/acme-production/billing');
    expect(within(dialog).getByText('2 invoices not settled')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('deletion-refusal-invoices'))
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['inv-1', 'inv-2']);
  });

  it('says in the API words why, when it gave some', () => {
    render(
      <DeletionRefusalDialog
        onClose={vi.fn()}
        refusal={{ ...instance, detail: 'Instance has a live subscription' }}
      />,
    );

    expect(
      screen.getByText('Instance has a live subscription'),
    ).toBeInTheDocument();
  });

  it('tells an ended subscription from a live one, and offers no link without a record', () => {
    render(
      <DeletionRefusalDialog
        onClose={vi.fn()}
        refusal={{ kind: 'instance', status: 'CANCELED', unpaidInvoiceIds: [] }}
      />,
    );

    expect(
      screen.getByText(
        'The subscription has ended, but some of its invoices are not settled.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByTestId('deletion-refusal-invoices')).toBeNull();
  });

  it('names what keeps a customer, and leads to it', () => {
    render(
      <DeletionRefusalDialog
        onClose={vi.fn()}
        refusal={{ kind: 'customer', live: true, unpaidInvoiceIds: ['inv-9'] }}
        slug="acme"
      />,
    );

    expect(
      screen.getByRole('dialog', { name: 'This customer cannot be deleted' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A subscription of one of its instances is still running.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the customer' }),
    ).toHaveAttribute('href', '/customers/acme');
    expect(screen.getByText('1 invoice not settled')).toBeInTheDocument();
  });

  it('counts what still references an entitlement', () => {
    render(
      <DeletionRefusalDialog
        onClose={vi.fn()}
        refusal={{
          kind: 'entitlement',
          references: [
            { count: 1, key: 'licenseGrants' },
            { count: 3, key: 'licensePrices' },
          ],
        }}
        slug="api-calls"
      />,
    );

    const list = screen.getByTestId('deletion-refusal-references');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Granted by 1 license version', 'Metered by 3 license prices']);
    expect(
      screen.getByRole('link', { name: 'Open the entitlement' }),
    ).toHaveAttribute('href', '/catalog/entitlements/api-calls');
  });

  it('asks for the references to be removed when they can be, and offers to hide the entitlement when a price or a boost holds it', () => {
    const { rerender } = render(
      <DeletionRefusalDialog
        onClose={vi.fn()}
        refusal={{
          kind: 'entitlement',
          references: [{ count: 2, key: 'usageCounters' }],
        }}
        slug="seats"
      />,
    );

    expect(
      screen.getByText(
        'Remove these references, then delete the entitlement again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/turn off “User facing”/)).toBeNull();

    rerender(
      <DeletionRefusalDialog
        onClose={vi.fn()}
        refusal={{
          kind: 'entitlement',
          references: [
            { count: 2, key: 'usageCounters' },
            { count: 1, key: 'boostGrants' },
          ],
        }}
        slug="seats"
      />,
    );

    expect(
      screen.getByText(/cannot be removed once it exists/),
    ).toHaveTextContent('turn off “User facing” on its page');
    expect(
      screen.queryByText(
        'Remove these references, then delete the entitlement again.',
      ),
    ).toBeNull();
  });

  it('closes when asked', async () => {
    const onClose = vi.fn();
    render(<DeletionRefusalDialog onClose={onClose} refusal={instance} />);

    // The cross of the dialog and the button of its foot both leave.
    const buttons = screen.getAllByRole('button', { name: 'Close' });
    for (const button of buttons) {
      await userEvent.click(button);
    }

    expect(buttons).toHaveLength(2);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
