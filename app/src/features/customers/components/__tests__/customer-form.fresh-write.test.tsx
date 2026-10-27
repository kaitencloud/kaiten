import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Customer } from '@/api-client';
import { handleGetCustomer, handleUpdateCustomer } from '@/api-client/msw.gen';
import {
  createTestClient,
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { CustomerFormDialog } from '../customer-form-dialog';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ current: undefined as never }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouteContext: () => ({ queryClient: client.current }),
}));
vi.mock('@/domains/crm-sync', () => ({
  ATTIO_CONNECTOR_NAME: 'kaiten.integration.crm.attio',
  startAttioSyncWatcher: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../hooks/use-customer-billing', () => ({
  useCustomerBilling: () => ({ isBillingEnabled: true, mayReadInvoices: false }),
}));

useBillingTexts();

const opened: Customer = {
  billingEmail: 'ap@acme.com',
  createdAt: '2026-06-11T12:00:00Z',
  createdBy: { id: 'user-1', name: 'User' },
  domain: 'acme.com',
  externalCustomerId: 'hs-1',
  id: 'customer-1',
  integrations: {},
  name: 'Acme',
  slug: 'acme',
  updatedAt: '2026-06-11T12:00:00Z',
  updatedBy: { id: 'user-1', name: 'User' },
};

let stored: Customer;
let updates: unknown[];

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  navigate.mockReset();
  const testClient = createTestClient();
  // The token says nothing of scopes: every action is offered.
  testClient.setQueryData(grantedScopesQueryKey, null);
  client.current = testClient as never;
  stored = opened;
  updates = [];
  server.use(
    handleGetCustomer(() => HttpResponse.json(stored)),
    handleUpdateCustomer(async ({ request }) => {
      updates.push(await request.json());

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const renderForm = () => {
  const onSuccess = vi.fn();
  renderWithClient(
    <CustomerFormDialog
      customer={opened}
      onOpenChange={vi.fn()}
      onSuccess={onSuccess}
      open
    />,
    client.current,
  );

  return onSuccess;
};

const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Update Customer' }));

describe('the form that edits a customer', () => {
  it('sends the fields that were changed on top of the customer as the API holds it now', async () => {
    const onSuccess = renderForm();
    const domain = await screen.findByLabelText('Domain');

    // Another tab changes the name and the billing e-mail after the form opened.
    stored = { ...stored, billingEmail: 'billing@acme.com', name: 'Acme (renamed)' };
    await userEvent.clear(domain);
    await userEvent.type(domain, 'acme.example');
    await save();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(updates).toEqual([
      {
        billingEmail: 'billing@acme.com',
        domain: 'acme.example',
        externalCustomerId: 'hs-1',
        name: 'Acme (renamed)',
      },
    ]);
  });

  it('lets the form win on a field that both changed', async () => {
    const onSuccess = renderForm();
    const name = await screen.findByLabelText(/^Name/);

    stored = { ...stored, name: 'Acme (renamed elsewhere)' };
    await userEvent.clear(name);
    await userEvent.type(name, 'Acme (renamed here)');
    await save();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(updates).toEqual([
      expect.objectContaining({ name: 'Acme (renamed here)' }),
    ]);
  });

  it('says the customer is gone when it was deleted meanwhile, and does not create it again', async () => {
    const onSuccess = renderForm();
    server.use(
      handleGetCustomer(() =>
        refusal(404, {
          code: 'GetCustomer.NotFound',
          detail: 'The customer does not exist',
        }),
      ),
    );
    const name = await screen.findByLabelText(/^Name/);

    await userEvent.type(name, ' 2');
    await save();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The customer does not exist'),
    );
    expect(updates).toHaveLength(0);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
