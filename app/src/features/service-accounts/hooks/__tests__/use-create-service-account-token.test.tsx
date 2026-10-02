import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { PlainToken, ServiceAccount } from '@/api-client';
import {
  handleCreateServiceAccountToken,
  handleGetServiceAccount,
  handleGetServiceAccounts,
} from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`, the status
// and the problem of a refusal, which is what the hook reports from.
import '@/lib/api/bootstrap';
import {
  serviceAccountQueryOptions,
  serviceAccountsQueryOptions,
} from '../../queries';
import { useCreateServiceAccountToken } from '../use-service-accounts-mutations';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

const created: PlainToken = {
  id: 'token-1',
  name: 'Production SDK',
  token: 'ksh_secret-value',
  scopes: ['read:feature_flags', 'write:instances'],
  createdAt: '2026-09-19T10:00:00.000Z',
  createdBy: { id: 'user-1', name: 'Splinter' },
};

const account: ServiceAccount = { name: 'SDK', slug: 'sdk', tokens: [] };

/**
 * Serves the token creation, and returns the requests it received: the account
 * slug of the path and the body.
 */
function serveTokenCreation(
  respond: () => Response = () => HttpResponse.json(created, { status: 201 }),
) {
  const requests: Array<{ serviceAccountSlug: string; body: unknown }> = [];
  server.use(
    handleCreateServiceAccountToken(async ({ params, request }) => {
      requests.push({
        serviceAccountSlug: params.serviceAccountSlug,
        body: await request.json(),
      });
      return respond();
    }),
  );
  return requests;
}

function renderCreateToken() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCreateServiceAccountToken('sdk'), {
    wrapper,
  });
  return { ...hook, queryClient };
}

describe('useCreateServiceAccountToken', () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  it('sends the scopes, then refreshes the list and the account the route loaded', async () => {
    const requests = serveTokenCreation();
    server.use(
      handleGetServiceAccounts({ body: { hasMore: false, items: [account] } }),
      handleGetServiceAccount({ body: account }),
    );
    const { result, queryClient } = renderCreateToken();
    // What the section layout and the new-token route load, under their keys.
    await queryClient.fetchQuery(serviceAccountsQueryOptions);
    await queryClient.fetchQuery(serviceAccountQueryOptions('sdk'));

    await act(() =>
      result.current.createToken({
        name: 'Production SDK',
        scopes: ['read:feature_flags', 'write:instances'],
      }),
    );

    // No expiry at all: an undefined field is left out of the JSON the API
    // receives.
    expect(requests).toEqual([
      {
        serviceAccountSlug: 'sdk',
        body: {
          name: 'Production SDK',
          scopes: ['read:feature_flags', 'write:instances'],
        },
      },
    ]);
    await waitFor(() =>
      expect(result.current.createdToken?.token).toBe('ksh_secret-value'),
    );
    expect(
      queryClient.getQueryState(serviceAccountsQueryOptions.queryKey)
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(serviceAccountQueryOptions('sdk').queryKey)
        ?.isInvalidated,
    ).toBe(true);
  });

  // The page promises the value is gone once it is left. A mutation outlives
  // its component for five minutes by default, data included.
  it('keeps no copy of the token once the page is left', async () => {
    serveTokenCreation();
    const { result, unmount, queryClient } = renderCreateToken();

    await act(() =>
      result.current.createToken({ name: 'Production SDK', scopes: [] }),
    );
    await waitFor(() => expect(result.current.createdToken).not.toBeNull());
    unmount();

    await waitFor(() =>
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0),
    );
  });

  it('reports a refusal and leaves the form free to try again', async () => {
    serveTokenCreation(() =>
      HttpResponse.json(
        {
          title: 'Forbidden',
          status: 403,
          detail: 'missing required scope: write:tokens',
          code: 'Auth.MissingScope',
        },
        {
          status: 403,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      ),
    );
    const { result } = renderCreateToken();

    await act(() =>
      result.current.createToken({ name: 'Production SDK', scopes: [] }),
    );

    expect(toastError).toHaveBeenCalledWith(
      'missing required scope: write:tokens',
    );
    expect(result.current.createdToken).toBeNull();
  });
});
