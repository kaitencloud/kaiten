import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useCanPerform } from '../hooks';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

const encode = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const jwt = (claims: unknown) =>
  `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;

// A read and a write, so that "not yet" and "not allowed" can be told apart: the
// first is false in both, the second only in the first.
function render() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(
    () => ({
      read: useCanPerform('invoice.read'),
      write: useCanPerform('invoice.markPaid'),
    }),
    { wrapper },
  );
}

beforeEach(() => {
  getAuthToken.mockReset();
});

describe('useCanPerform', () => {
  it('offers nothing while the token is being read', () => {
    getAuthToken.mockReturnValue(new Promise(() => {}));

    const { result } = render();

    expect(result.current).toEqual({ read: false, write: false });
  });

  it('offers what the scopes of the token cover, and hides the rest', async () => {
    getAuthToken.mockResolvedValue(jwt({ scopes: ['read:billing'] }));

    const { result } = render();

    await waitFor(() => expect(result.current.read).toBe(true));
    expect(result.current.write).toBe(false);
  });

  it('offers a write to a token that holds the write scope', async () => {
    getAuthToken.mockResolvedValue(jwt({ scopes: ['write:billing'] }));

    const { result } = render();

    await waitFor(() => expect(result.current.write).toBe(true));
    expect(result.current.read).toBe(true);
  });

  it('offers everything to an administrator', async () => {
    getAuthToken.mockResolvedValue(jwt({ scopes: ['write:*'] }));

    const { result } = render();

    await waitFor(() => expect(result.current).toEqual({ read: true, write: true }));
  });

  it('offers every action when the token says nothing about scopes, and lets the API refuse', async () => {
    getAuthToken.mockResolvedValue(jwt({ sub: 'user_1' }));

    const { result } = render();

    await waitFor(() => expect(result.current).toEqual({ read: true, write: true }));
  });

  it('offers every action when there is no token to read', async () => {
    getAuthToken.mockResolvedValue(undefined);

    const { result } = render();

    await waitFor(() => expect(result.current).toEqual({ read: true, write: true }));
  });
});
