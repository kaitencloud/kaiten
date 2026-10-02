import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Customer } from '@/api-client';
import {
  handleCreateCustomer,
  handleUpdateCustomer,
} from '@/api-client/msw.gen';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import { useCustomerFormMutations } from './customer-form.mutations';

const { invalidateCustomerQueriesMock, startAttioSyncWatcherMock } = vi.hoisted(
  () => ({
    invalidateCustomerQueriesMock: vi.fn(),
    startAttioSyncWatcherMock: vi.fn(),
  }),
);

let queryClient: QueryClient;

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

vi.mock('@/domains/customer-management/queries', () => ({
  invalidateCustomerQueries: invalidateCustomerQueriesMock,
}));

vi.mock('@/domains/crm-sync', () => ({
  ATTIO_CONNECTOR_NAME: 'kaiten.integration.crm.attio',
  startAttioSyncWatcher: startAttioSyncWatcherMock,
}));

const baseCustomer: Customer = {
  createdAt: '2026-06-11T12:00:00Z',
  createdBy: { id: 'user-1', name: 'User' },
  externalCustomerId: null,
  id: 'customer-1',
  integrations: {},
  name: 'Acme',
  slug: 'acme',
  updatedAt: '2026-06-11T12:00:00Z',
  updatedBy: { id: 'user-1', name: 'User' },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCustomerFormMutations', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    invalidateCustomerQueriesMock.mockReset();
    startAttioSyncWatcherMock.mockReset();
    invalidateCustomerQueriesMock.mockResolvedValue(undefined);
    startAttioSyncWatcherMock.mockResolvedValue(undefined);
  });

  it('starts the Attio watcher after creating an unlinked customer', async () => {
    const bodies: unknown[] = [];
    server.use(
      handleCreateCustomer(async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(baseCustomer, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useCustomerFormMutations(), {
      wrapper,
    });

    await act(async () => {
      await result.current.createMutation.mutateAsync({
        body: { name: 'Acme' },
      });
    });

    expect(bodies).toEqual([{ name: 'Acme' }]);
    expect(startAttioSyncWatcherMock).toHaveBeenCalledWith({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'acme',
      integrations: {},
    });
  });

  it('uses the existing entity state after a 204 customer update', async () => {
    const updates: Array<{ customerSlug: string; body: unknown }> = [];
    server.use(
      handleUpdateCustomer(async ({ params, request }) => {
        updates.push({
          customerSlug: params.customerSlug,
          body: await request.json(),
        });
        // No Content: the answer carries no customer to read the state from.
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const customer = {
      ...baseCustomer,
      integrations: {
        [ATTIO_CONNECTOR_NAME]: {
          external_id: 'attio-company-1',
          metadata: {},
          synced_at: '2026-06-11T12:05:00Z',
        },
      },
    };
    const { result } = renderHook(() => useCustomerFormMutations(customer), {
      wrapper,
    });

    await act(async () => {
      await result.current.updateMutation.mutateAsync({
        path: { customerSlug: 'acme' },
        body: { name: 'Acme updated' },
      });
    });

    expect(updates).toEqual([
      { customerSlug: 'acme', body: { name: 'Acme updated' } },
    ]);
    expect(invalidateCustomerQueriesMock).toHaveBeenCalledWith(
      queryClient,
      'acme',
    );
    expect(startAttioSyncWatcherMock.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateCustomerQueriesMock.mock.invocationCallOrder[0]!,
    );
    expect(startAttioSyncWatcherMock).toHaveBeenCalledWith({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'acme',
      integrations: customer.integrations,
      watchForChange: true,
    });
  });
});
