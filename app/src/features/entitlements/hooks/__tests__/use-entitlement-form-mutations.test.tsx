import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import { listEntitlementsOptions } from '@/api-client/@tanstack/react-query.gen';
import {
  handleCreateEntitlement,
  handleListEntitlements,
} from '@/api-client/msw.gen';
import '@/lib/api/bootstrap';
import { useEntitlementFormMutations } from '../use-entitlement-form-mutations';

const created = {
  createdAt: '2026-10-23T10:00:00.000Z',
  description: '',
  id: 'entitlement-1',
  name: 'Storage Reads',
  slug: 'storage-reads',
  type: 'NUMBER',
  updatedAt: '2026-10-23T10:00:00.000Z',
} as Entitlement;

let queryClient: QueryClient;
let listRequests: number;
let releaseList: () => void;
let listGate: Promise<void>;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const render = () =>
  renderHook(
    () => ({
      list: useQuery(listEntitlementsOptions()),
      mutations: useEntitlementFormMutations(),
    }),
    { wrapper },
  );

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  listRequests = 0;
  listGate = Promise.resolve();
  server.use(
    handleCreateEntitlement(() => HttpResponse.json(created, { status: 201 })),
    handleListEntitlements(async () => {
      listRequests += 1;
      await listGate;

      return HttpResponse.json({ hasMore: false, items: [] });
    }),
  );
});

describe('the creation of an entitlement', () => {
  // A creation that is recovered writes its tombstone when the mutation resolves, before
  // the page goes: the mutation must not wait for the list to come back.
  it('resolves before the list of entitlements has been read again, which already shows the new one', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(listRequests).toBe(1);

    // From now on the list answers when it is told to.
    listGate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    let resolved = false;
    const creation = act(async () => {
      await result.current.mutations.createMutation.mutateAsync({
        body: { description: '', name: 'Storage Reads', type: 'NUMBER' },
      });
      resolved = true;
    });

    // The list is refetching and has not answered, and the creation is over.
    await waitFor(() => expect(listRequests).toBe(2));
    await waitFor(() => expect(resolved).toBe(true));
    // Meanwhile the list already shows it.
    expect(result.current.list.data?.items[0]?.slug).toBe('storage-reads');

    releaseList();
    await creation;
  });
});
