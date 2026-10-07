import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  useActionAccess,
  useCanPerform,
  useInvoiceActionAccess,
} from '../hooks';

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

describe('useActionAccess', () => {
  const renderAccess = () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    return renderHook(() => useActionAccess('invoice.markPaid'), { wrapper });
  };

  it('says it does not know yet while the token is being read, which is not a refusal', () => {
    getAuthToken.mockReturnValue(new Promise(() => {}));

    const { result } = renderAccess();

    expect(result.current).toEqual({ allowed: false, isPending: true });
  });

  it('says it knows once it has read the token, and what the scopes cover', async () => {
    getAuthToken.mockResolvedValue(jwt({ scopes: ['read:billing'] }));

    const { result } = renderAccess();

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.allowed).toBe(false);
  });

  it('allows what the scopes cover', async () => {
    getAuthToken.mockResolvedValue(jwt({ scopes: ['write:billing'] }));

    const { result } = renderAccess();

    await waitFor(() =>
      expect(result.current).toEqual({ allowed: true, isPending: false }),
    );
  });
});

describe('useInvoiceActionAccess', () => {
  const renderAccess = () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    return renderHook(() => useInvoiceActionAccess(), { wrapper });
  };
  const NONE = {
    markPaid: false,
    recompose: false,
    releaseHold: false,
    void: false,
    writeOff: false,
  };
  const ALL = {
    markPaid: true,
    recompose: true,
    releaseHold: true,
    void: true,
    writeOff: true,
  };

  it('allows no action while the token is being read', () => {
    getAuthToken.mockReturnValue(new Promise(() => {}));

    expect(renderAccess().result.current).toEqual(NONE);
  });

  it('allows the five actions to a token that holds the write scope', async () => {
    getAuthToken.mockResolvedValue(jwt({ scopes: ['write:billing'] }));

    const { result } = renderAccess();

    await waitFor(() => expect(result.current).toEqual(ALL));
  });

  it('allows none to a token that may only read', async () => {
    getAuthToken.mockResolvedValue(jwt({ scopes: ['read:billing'] }));

    const { result } = renderAccess();

    // Not known yet and not allowed read alike: wait for the token to be read.
    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toEqual(NONE));
  });

  it('allows every action when the token says nothing of its scopes, and lets the API refuse', async () => {
    getAuthToken.mockResolvedValue(jwt({ sub: 'user_1' }));

    const { result } = renderAccess();

    await waitFor(() => expect(result.current).toEqual(ALL));
  });
});
