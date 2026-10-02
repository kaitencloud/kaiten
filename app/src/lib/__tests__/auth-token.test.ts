import Cookies from 'js-cookie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
const { getStoredDevToken } = vi.hoisted(() => ({
  getStoredDevToken: vi.fn<() => string | null>(),
}));

vi.mock('../local-auth', () => ({ getStoredDevToken }));

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
    vi.resetModules();
    vi.stubEnv('VITE_LOCAL_AUTH', 'false');
    originalClerk = clerkWindow.Clerk;
    vi.mocked(Cookies.get).mockReset().mockReturnValue(undefined as never);
    getStoredDevToken.mockReset().mockReturnValue(null);
    Reflect.deleteProperty(clerkWindow, 'Clerk');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (originalClerk !== undefined) {
      clerkWindow.Clerk = originalClerk;
      return;
    }

    Reflect.deleteProperty(clerkWindow, 'Clerk');
  });

  it('prefers the live Clerk session token when available', async () => {
    const { getAuthToken } = await import('../auth-token');
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
    const { getAuthToken } = await import('../auth-token');
    vi.mocked(Cookies.get).mockReturnValue('cookie-token' as never);

    await expect(getAuthToken()).resolves.toBe('cookie-token');
    expect(Cookies.get).toHaveBeenCalledWith('__session');
  });

  it('returns undefined when no auth token source is available', async () => {
    const { getAuthToken } = await import('../auth-token');
    vi.mocked(Cookies.get).mockReturnValue(undefined as never);

    await expect(getAuthToken()).resolves.toBeUndefined();
  });

  it('falls back to the cookie when the Clerk session has no token', async () => {
    const { getAuthToken } = await import('../auth-token');
    clerkWindow.Clerk = { session: { getToken: vi.fn().mockResolvedValue(null) } };
    vi.mocked(Cookies.get).mockReturnValue('cookie-token' as never);

    await expect(getAuthToken()).resolves.toBe('cookie-token');
  });

  it('uses only the selected dev token in local-auth mode', async () => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true');
    const { getAuthToken } = await import('../auth-token');
    const getToken = vi.fn().mockResolvedValue('clerk-token');
    clerkWindow.Clerk = { session: { getToken } };
    vi.mocked(Cookies.get).mockReturnValue('cookie-token' as never);
    getStoredDevToken.mockReturnValue('dev-token');

    await expect(getAuthToken()).resolves.toBe('dev-token');
    getStoredDevToken.mockReturnValue('rotated-dev-token');
    await expect(getAuthToken()).resolves.toBe('rotated-dev-token');
    expect(getToken).not.toHaveBeenCalled();
    expect(Cookies.get).not.toHaveBeenCalled();
  });

  it('does not reuse a session cookie when no local identity is selected', async () => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true');
    const { getAuthToken } = await import('../auth-token');
    vi.mocked(Cookies.get).mockReturnValue('previous-session' as never);

    await expect(getAuthToken()).resolves.toBeUndefined();
    expect(Cookies.get).not.toHaveBeenCalled();
  });
});
