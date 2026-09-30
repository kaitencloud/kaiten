import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  getServiceAccountQueryKey,
  getServiceAccountsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { useCreateServiceAccountToken } from '../use-service-accounts-mutations';

const { mutationFn, toastError } = vi.hoisted(() => ({
  mutationFn: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/api-client/@tanstack/react-query.gen', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/api-client/@tanstack/react-query.gen')
  >()),
  createServiceAccountTokenMutation: () => ({ mutationFn }),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

const created = {
  id: 'token-1',
  name: 'Production SDK',
  token: 'ksh_secret-value',
  scopes: ['read:feature_flags', 'write:instances'],
  createdAt: '2026-09-19T10:00:00.000Z',
  createdBy: { id: 'user-1', name: 'Splinter' },
};

function renderCreateToken() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCreateServiceAccountToken('sdk'), {
    wrapper,
  });
  return { ...hook, invalidate, queryClient };
}

describe('useCreateServiceAccountToken', () => {
  beforeEach(() => {
    mutationFn.mockReset();
    toastError.mockReset();
  });

  it('sends the scopes, then refreshes the list and the account the route loaded', async () => {
    mutationFn.mockResolvedValue(created);
    const { result, invalidate } = renderCreateToken();

    await act(() =>
      result.current.createToken({
        name: 'Production SDK',
        scopes: ['read:feature_flags', 'write:instances'],
      }),
    );

    expect(mutationFn.mock.calls[0][0]).toEqual({
      path: { serviceAccountSlug: 'sdk' },
      body: {
        name: 'Production SDK',
        scopes: ['read:feature_flags', 'write:instances'],
        expiresAt: undefined,
      },
    });
    await waitFor(() =>
      expect(result.current.createdToken?.token).toBe('ksh_secret-value'),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: getServiceAccountsQueryKey(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: getServiceAccountQueryKey({
        path: { serviceAccountSlug: 'sdk' },
      }),
    });
  });

  // The page promises the value is gone once it is left. A mutation outlives
  // its component for five minutes by default, data included.
  it('keeps no copy of the token once the page is left', async () => {
    mutationFn.mockResolvedValue(created);
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
    mutationFn.mockRejectedValue(new Error('missing required scope'));
    const { result } = renderCreateToken();

    await act(() =>
      result.current.createToken({ name: 'Production SDK', scopes: [] }),
    );

    expect(toastError).toHaveBeenCalled();
    expect(result.current.createdToken).toBeNull();
  });
});
