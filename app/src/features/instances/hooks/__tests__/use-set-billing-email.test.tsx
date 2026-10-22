import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Customer } from '@/api-client';
import { handleGetCustomer, handleUpdateCustomer } from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`.
import '@/lib/api/bootstrap';
import { useSetBillingEmail } from '../use-set-billing-email';

const opened = {
  billingEmail: undefined,
  createdAt: '',
  domain: 'globex.com',
  externalCustomerId: 'hs-1',
  id: 'customer-1',
  name: 'Globex',
  slug: 'globex',
  updatedAt: '',
} as unknown as Customer;

let queryClient: QueryClient;
let stored: Customer;
let updates: unknown[];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  stored = opened;
  updates = [];
  server.use(
    handleGetCustomer(() => HttpResponse.json(stored)),
    handleUpdateCustomer(async ({ request }) => {
      const body = (await request.json()) as Partial<Customer>;
      updates.push(body);
      stored = { ...stored, ...body } as Customer;

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

describe('useSetBillingEmail', () => {
  it('compares a second save with the address the first one set, not with the customer it opened with', async () => {
    const { result } = renderHook(() => useSetBillingEmail(opened), {
      wrapper,
    });

    await act(() => result.current.save('ap@globex.com'));
    // The address is taken off again: that is a change from what the first save
    // left, though it equals what the hook opened with.
    await act(() => result.current.save(''));

    expect(updates).toEqual([
      expect.objectContaining({ billingEmail: 'ap@globex.com' }),
      expect.objectContaining({ billingEmail: '' }),
    ]);
  });

  it('keeps what changed on the customer meanwhile at each save', async () => {
    const { result } = renderHook(() => useSetBillingEmail(opened), {
      wrapper,
    });

    stored = { ...stored, name: 'Globex (renamed)' } as Customer;
    await act(() => result.current.save('ap@globex.com'));

    expect(updates).toEqual([
      expect.objectContaining({
        billingEmail: 'ap@globex.com',
        name: 'Globex (renamed)',
      }),
    ]);
  });
});
