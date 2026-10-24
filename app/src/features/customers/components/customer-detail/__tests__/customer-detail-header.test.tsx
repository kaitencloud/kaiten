import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Customer } from '@/api-client';
import { handleGetCustomer, handleUpdateCustomer } from '@/api-client/msw.gen';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  createTestClient,
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { CustomerDetailHeader } from '../customer-detail-header';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const client = vi.hoisted(() => ({ current: undefined as never }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params: _params,
    search: _search,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    params?: unknown;
    search?: unknown;
    to: string;
  }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouteContext: () => ({ queryClient: client.current }),
}));
vi.mock('@/domains/crm-sync', () => ({
  ATTIO_CONNECTOR_NAME: 'kaiten.integration.crm.attio',
  startAttioSyncWatcher: vi.fn().mockResolvedValue(undefined),
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

const renderHeader = () =>
  renderWithClient(
    <CustomerDetailHeader
      customer={opened}
      hasActiveInstances={false}
      isDeleting={false}
      isInstancesLoading={false}
      onDelete={vi.fn()}
    />,
    client.current,
  );

const rename = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name: 'Acme' }));
  const input = await screen.findByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, `${name}{Enter}`);
};

describe('the rename of a customer from its page', () => {
  it('sends the name on top of the customer as the API holds it, not as the page loaded it', async () => {
    renderHeader();
    await screen.findByRole('button', { name: 'Acme' });

    // Another tab changes the domain and the billing e-mail after the page loaded.
    stored = { ...stored, billingEmail: 'billing@acme.com', domain: 'acme.example' };
    await rename('Acme Inc.');

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      billingEmail: 'billing@acme.com',
      domain: 'acme.example',
      externalCustomerId: 'hs-1',
      name: 'Acme Inc.',
    });
  });

  it('says the customer is gone when it was deleted meanwhile, and writes nothing', async () => {
    renderHeader();
    await screen.findByRole('button', { name: 'Acme' });
    server.use(
      handleGetCustomer(() =>
        refusal(404, {
          code: 'GetCustomer.NotFound',
          detail: 'The customer does not exist',
        }),
      ),
    );

    await rename('Acme Inc.');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The customer does not exist'),
    );
    expect(updates).toHaveLength(0);
  });
});
