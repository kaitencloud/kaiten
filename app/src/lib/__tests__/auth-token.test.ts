import Cookies from 'js-cookie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { getAuthToken } from '../auth-token';

vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn(() => undefined),
  },
}));

type TestClerkWindow = {
  Clerk?: unknown;
};

describe('getAuthToken', () => {
  const clerkWindow = window as unknown as TestClerkWindow;
  let originalClerk: unknown;

  beforeEach(() => {
    originalClerk = clerkWindow.Clerk;
    vi.clearAllMocks();
    Reflect.deleteProperty(clerkWindow, 'Clerk');
  });

  afterEach(() => {
    if (originalClerk !== undefined) {
      clerkWindow.Clerk = originalClerk;
      return;
    }

    Reflect.deleteProperty(clerkWindow, 'Clerk');
  });

  it('prefers the live Clerk session token when available', async () => {
    const getToken = vi.fn().mockResolvedValue('clerk-token');

    clerkWindow.Clerk = {
      session: { getToken },
    };
    vi.mocked(Cookies.get).mockReturnValue('cookie-token' as never);

    await expect(getAuthToken()).resolves.toBe('clerk-token');
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(Cookies.get).not.toHaveBeenCalled();
  });

  it('falls back to the __session cookie when Clerk is unavailable', async () => {
    vi.mocked(Cookies.get).mockReturnValue('cookie-token' as never);

    await expect(getAuthToken()).resolves.toBe('cookie-token');
    expect(Cookies.get).toHaveBeenCalledWith('__session');
  });

  it('returns undefined when no auth token source is available', async () => {
    vi.mocked(Cookies.get).mockReturnValue(undefined as never);

    await expect(getAuthToken()).resolves.toBeUndefined();
  });
});
