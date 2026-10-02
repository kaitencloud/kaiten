import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const {
  envMock,
  getAuthTokenMock,
  getBooleanValueMock,
  setProviderAndWaitMock,
  getStoredDevTokenMock,
} = vi.hoisted(() => ({
    envMock: {
      API_URL: 'http://api.test/api',
      PLATFORM_API_URL: '',
      PLATFORM_FLAGS_TOKEN: '',
    },
    getAuthTokenMock: vi.fn(async () => 'token' as string | undefined),
    getStoredDevTokenMock: vi.fn<() => string | null>(() => null),
    getBooleanValueMock: vi.fn(() => true),
    setProviderAndWaitMock: vi.fn(
      async (_provider: unknown, _context: unknown) => undefined,
    ),
  }));

vi.mock('@openfeature/ofrep-web-provider', () => ({
  // Keeps what it was built with, so a test can read the app's configuration
  // without a network.
  OFREPWebProvider: class {
    options: unknown;

    constructor(options: unknown) {
      this.options = options;
    }
  },
}));

vi.mock('@openfeature/web-sdk', () => ({
  OpenFeature: {
    getClient: () => ({ getBooleanValue: getBooleanValueMock }),
    setProviderAndWait: setProviderAndWaitMock,
  },
}));

vi.mock('../auth-token', () => ({ getAuthToken: getAuthTokenMock }));

vi.mock('virtual:dev-tokens', () => ({ default: [
  { token: 'dev-token', user_id: 'local-user', org_id: 'local-org' },
] }));

vi.mock('../local-auth', () => ({ getStoredDevToken: getStoredDevTokenMock }));

vi.mock('@/env', () => ({ default: envMock }));

let originalClerk: unknown;
beforeEach(() => {
  originalClerk = (window as unknown as { Clerk?: unknown }).Clerk;
  vi.stubEnv('VITE_LOCAL_AUTH', 'false');
  vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'false');
  vi.stubEnv('DEV', true);
  getStoredDevTokenMock.mockReset().mockReturnValue(null);
});
afterEach(() => {
  (window as unknown as { Clerk?: unknown }).Clerk = originalClerk;
  vi.unstubAllEnvs();
  vi.resetModules();
});

type ProviderOptions = {
  baseUrl: string;
  headersFactory: () => Promise<[string, string][]>;
  cacheMode?: string;
};

/** The options of the provider the app registered last. */
function registeredProviderOptions(): ProviderOptions {
  const [provider] = setProviderAndWaitMock.mock.lastCall ?? [];
  return (provider as { options: ProviderOptions }).options;
}

/** Stands in for the signed-in user the targeting key is resolved from. */
function signIn(userId: string | null, organizationId?: string) {
  (window as unknown as { Clerk?: unknown }).Clerk = userId
    ? { user: { id: userId }, organization: { id: organizationId } }
    : undefined;
}

async function evaluate(): Promise<boolean> {
  const { demoSandboxFlagQueryOptions } = await import('../feature-flags');

  return (await demoSandboxFlagQueryOptions.queryFn?.(
    {} as never,
  )) as boolean;
}

describe('platform flags against the local API', () => {
  beforeEach(() => {
    vi.resetModules();
    envMock.PLATFORM_API_URL = '';
    envMock.PLATFORM_FLAGS_TOKEN = '';
    setProviderAndWaitMock.mockClear().mockResolvedValue(undefined);
    getBooleanValueMock.mockClear().mockReturnValue(true);
    getAuthTokenMock.mockClear().mockResolvedValue('token');
    signIn('user-1');
  });

  it('returns the evaluated flag once the provider is registered', async () => {
    expect(await evaluate()).toBe(true);
    expect(setProviderAndWaitMock).toHaveBeenCalledTimes(1);
  });

  it('pins the evaluation to the signed-in user', async () => {
    // The regression this guards, and it cost an afternoon: with no targeting
    // key the evaluator answers PROVIDER_FATAL ("missing targeting key") for
    // every flag, the SDK maps that failure to the default value, and the gate
    // reads "off" no matter what the catalog says — a flag switched on in the
    // product simply never reaches the app.
    await evaluate();

    expect(setProviderAndWaitMock).toHaveBeenCalledWith(expect.anything(), {
      targetingKey: 'user-1',
    });
  });

  it("authenticates each request with the session's current token", async () => {
    await evaluate();
    const { baseUrl, headersFactory } = registeredProviderOptions();

    // The provider appends `/ofrep/v1/...` to the base URL, so `/api` stays.
    expect(baseUrl).toBe('http://api.test/api');
    expect(await headersFactory()).toEqual([['Authorization', 'Bearer token']]);

    // Asked again on every request: a rotated Clerk token is picked up, and a
    // session that ended sends no credential rather than a stale one.
    getAuthTokenMock.mockResolvedValue('rotated');
    expect(await headersFactory()).toEqual([
      ['Authorization', 'Bearer rotated'],
    ]);
    getAuthTokenMock.mockResolvedValue(undefined);
    expect(await headersFactory()).toEqual([]);
  });

  it('evaluates over the network, never from a persisted cache', async () => {
    // The provider's default starts from localStorage and refreshes behind it,
    // which would hand the gate the answer from before a toggle.
    await evaluate();

    expect(registeredProviderOptions().cacheMode).toBe('disabled');
  });

  it('stays off when no user can be identified', async () => {
    signIn(null);

    expect(await evaluate()).toBe(false);
    expect(setProviderAndWaitMock).not.toHaveBeenCalled();
  });

  it('registers the provider once across repeated evaluations', async () => {
    const { demoSandboxFlagQueryOptions } = await import('../feature-flags');
    const run = () => demoSandboxFlagQueryOptions.queryFn?.({} as never);

    await Promise.all([run(), run()]);

    expect(setProviderAndWaitMock).toHaveBeenCalledTimes(1);
  });

  it('stays off without a session, without asking the API', async () => {
    // Signing in is asynchronous; evaluating before a credential exists would
    // otherwise cache "off" for a session that was merely still starting up.
    getAuthTokenMock.mockResolvedValue(undefined);

    expect(await evaluate()).toBe(false);
    expect(setProviderAndWaitMock).not.toHaveBeenCalled();
  });

  it('fails closed when the provider cannot initialize', async () => {
    // The regression this guards: a guard resolving the flag in `beforeLoad`
    // would replace its redirect with an error page on a thrown error — and a
    // flag-gated surface must not show up by accident, so "we could not find
    // out" must resolve to off.
    setProviderAndWaitMock.mockRejectedValue(new Error('OFREP unreachable'));

    expect(await evaluate()).toBe(false);
  });

  it('re-reads the provider after a successful mutation', async () => {
    // The regression this guards: invalidating only the React Query answer
    // refetches straight back into the web SDK's initialization-time cache, so
    // a flag just toggled in the feature-flags page keeps evaluating stale.
    const { demoSandboxFlagQueryOptions, subscribeFeatureFlagRefresh } =
      await import('../feature-flags');
    const run = () => demoSandboxFlagQueryOptions.queryFn?.({} as never);

    const invalidateQueries = vi.fn();
    let notify: ((event: unknown) => void) | undefined;
    const queryClient = {
      getMutationCache: () => ({
        subscribe: (listener: (event: unknown) => void) => {
          notify = listener;
          return () => {};
        },
      }),
      invalidateQueries,
    };

    await run();
    expect(setProviderAndWaitMock).toHaveBeenCalledTimes(1);

    subscribeFeatureFlagRefresh(queryClient as never);
    notify?.({ type: 'updated', mutation: { state: { status: 'success' } } });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature-flags'],
    });

    await run();
    expect(setProviderAndWaitMock).toHaveBeenCalledTimes(2);
  });

  it('leaves the provider alone while a mutation is still pending', async () => {
    const { demoSandboxFlagQueryOptions, subscribeFeatureFlagRefresh } =
      await import('../feature-flags');
    const run = () => demoSandboxFlagQueryOptions.queryFn?.({} as never);

    let notify: ((event: unknown) => void) | undefined;
    const queryClient = {
      getMutationCache: () => ({
        subscribe: (listener: (event: unknown) => void) => {
          notify = listener;
          return () => {};
        },
      }),
      invalidateQueries: vi.fn(),
    };

    await run();
    subscribeFeatureFlagRefresh(queryClient as never);
    notify?.({ type: 'updated', mutation: { state: { status: 'pending' } } });

    await run();
    expect(setProviderAndWaitMock).toHaveBeenCalledTimes(1);
  });

  it('retries registration after a failure instead of caching the outage', async () => {
    const { demoSandboxFlagQueryOptions } = await import('../feature-flags');
    const run = () => demoSandboxFlagQueryOptions.queryFn?.({} as never);

    setProviderAndWaitMock.mockRejectedValueOnce(new Error('transient'));
    expect(await run()).toBe(false);

    expect(await run()).toBe(true);
    expect(setProviderAndWaitMock).toHaveBeenCalledTimes(2);
  });

  it('evaluates for the selected local user without a Clerk identity', async () => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true');
    getStoredDevTokenMock.mockReturnValue('dev-token');
    signIn(null);

    expect(await evaluate()).toBe(true);
    expect(setProviderAndWaitMock).toHaveBeenCalledWith(expect.anything(), {
      targetingKey: 'local-user',
    });
  });

  it('stays off when the local token has no seeded identity', async () => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true');
    getStoredDevTokenMock.mockReturnValue('unknown-token');

    expect(await evaluate()).toBe(false);
    expect(setProviderAndWaitMock).not.toHaveBeenCalled();
  });

  it('evaluates as the E2E actor only when bypass is explicitly enabled', async () => {
    vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'true');
    signIn(null);
    getAuthTokenMock.mockResolvedValue(undefined);

    expect(await evaluate()).toBe(true);
    expect(setProviderAndWaitMock).toHaveBeenCalledWith(expect.anything(), {
      targetingKey: 'e2e',
    });
    expect(await registeredProviderOptions().headersFactory()).toEqual([]);
  });

  it('does not evaluate against the tenant API in a self-hosted production build', async () => {
    vi.stubEnv('DEV', false);

    expect(await evaluate()).toBe(false);
    expect(setProviderAndWaitMock).not.toHaveBeenCalled();
  });
});

describe('platform flags against the platform flag service', () => {
  beforeEach(() => {
    vi.resetModules();
    envMock.PLATFORM_API_URL = 'https://platform.test/api';
    envMock.PLATFORM_FLAGS_TOKEN = 'reader-token';
    setProviderAndWaitMock.mockClear().mockResolvedValue(undefined);
    getBooleanValueMock.mockClear().mockReturnValue(true);
    getAuthTokenMock.mockClear().mockResolvedValue('session-token');
    signIn('user-1', 'org_3JKpp4TPWQDLjnrcUCDnwL73jE4');
  });

  it('evaluates for the organization, in the shape the service enriches', async () => {
    // The regression this guards: the tenant's own catalog cannot say whether
    // Kaiten shipped a feature to that tenant, and a platform rule can only read
    // the tenant's instance when the context names it by its derived slug.
    const { demoSandboxFlagQueryOptions } = await import('../feature-flags');

    expect(await demoSandboxFlagQueryOptions.queryFn?.({} as never)).toBe(true);
    expect(setProviderAndWaitMock).toHaveBeenCalledWith(expect.anything(), {
      targetingKey: '87052d9c-88de-5900-80fe-f8a05abda186',
      organizationId: '87052d9c-88de-5900-80fe-f8a05abda186',
      kaiten: { instanceSlug: '87052d9c-88de-5900-80fe-f8a05abda186' },
    });
    expect(getBooleanValueMock).toHaveBeenCalledWith('demo-sandbox', false);
  });

  it('authenticates with the reader token, never the session', async () => {
    // The session token belongs to the tenant deployment; the platform flag
    // service would reject it, and it must not leave for another host.
    await evaluate();
    const { baseUrl, headersFactory } = registeredProviderOptions();

    expect(baseUrl).toBe('https://platform.test/api');
    expect(await headersFactory()).toEqual([
      ['Authorization', 'Bearer reader-token'],
    ]);
  });

  it('stays off without an organization', async () => {
    signIn('user-1');

    expect(await evaluate()).toBe(false);
    expect(setProviderAndWaitMock).not.toHaveBeenCalled();
  });

  it('re-registers when the organization changes', async () => {
    const { demoSandboxFlagQueryOptions } = await import('../feature-flags');
    const run = () => demoSandboxFlagQueryOptions.queryFn?.({} as never);

    await run();
    signIn('user-1', 'org_other');
    await run();

    expect(setProviderAndWaitMock).toHaveBeenCalledTimes(2);
  });

  it('does not re-evaluate on tenant mutations', async () => {
    const { subscribeFeatureFlagRefresh } = await import('../feature-flags');
    const subscribe = vi.fn();

    subscribeFeatureFlagRefresh({
      getMutationCache: () => ({ subscribe }),
    } as never);

    expect(subscribe).not.toHaveBeenCalled();
  });

  it('uses the seeded organization for local-auth platform evaluation', async () => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true');
    getStoredDevTokenMock.mockReturnValue('dev-token');
    signIn(null);

    expect(await evaluate()).toBe(true);
    expect(setProviderAndWaitMock).toHaveBeenCalledWith(expect.anything(), {
      targetingKey: 'local-org',
      organizationId: 'local-org',
      kaiten: { instanceSlug: 'local-org' },
    });
    expect(await registeredProviderOptions().headersFactory()).toEqual([
      ['Authorization', 'Bearer reader-token'],
    ]);
  });
});
