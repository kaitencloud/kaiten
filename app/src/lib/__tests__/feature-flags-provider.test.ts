import { OpenFeature } from '@openfeature/web-sdk';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

const target = '55555555-5555-5555-5555-555555555555';
vi.mock('@/env', () => ({ default: { API_URL: 'http://tenant.invalid/api', PLATFORM_API_URL: 'http://platform.invalid/api', PLATFORM_FLAGS_TOKEN: 'synthetic-read-only-token' } }));
vi.mock('virtual:dev-tokens', () => ({ default: [{ token: 'synthetic-session', user_id: 'fixture-user', org_id: '55555555-5555-5555-5555-555555555555' }] }));
vi.mock('../local-auth', () => ({ getStoredDevToken: () => 'synthetic-session' }));
vi.mock('../auth-token', () => ({ getAuthToken: async () => 'synthetic-session' }));

beforeEach(() => {
  vi.stubEnv('VITE_LOCAL_AUTH', 'true');
  vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'false');
});
afterEach(async () => {
  await OpenFeature.clearProviders();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Use the actual OpenFeature/OFREP provider with a fake HTTP transport. No
// browser, platform runtime or network is reached, including during refresh.
function fakeEvaluation(value: unknown, reason = 'TARGETING_MATCH') {
  return new Response(JSON.stringify({ flags: [{ key: 'ai-credits', value, variant: 'on', reason }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

it('accepts a positive bulk-only OFREP fixture, refreshes it, then denies revocation', async () => {
  const fetch = vi.fn(async () => fakeEvaluation(true));
  vi.stubGlobal('fetch', fetch);
  const { aiCreditsFlagQueryOptions } = await import('../feature-flags');
  const evaluate = () => aiCreditsFlagQueryOptions.queryFn?.({} as never);
  expect(await evaluate()).toBe(true);
  expect(await evaluate()).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  const [request] = fetch.mock.calls[0] as unknown as [Request];
  expect(request.url).toBe('http://platform.invalid/api/ofrep/v1/evaluate/flags');
  expect(request.headers.get('Authorization')).toBe('Bearer synthetic-read-only-token');
  expect(await request.json()).toEqual({ context: { targetingKey: target, organizationId: target, kaiten: { instanceSlug: target } } });
  fetch.mockImplementation(async () => fakeEvaluation(false));
  expect(await evaluate()).toBe(false);
});

it('shares only an in-flight evaluation and re-reads after it settles', async () => {
  let complete!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const { aiCreditsFlagQueryOptions } = await import('../feature-flags');
  const evaluate = () => aiCreditsFlagQueryOptions.queryFn?.({} as never);
  const first = evaluate();
  const second = evaluate();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  complete(fakeEvaluation(true));
  expect(await Promise.all([first, second])).toEqual([true, true]);
  fetch.mockImplementation(async () => fakeEvaluation(false));
  expect(await evaluate()).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(['DEFAULT', 'STATIC', 'TARGETING_MATCH', 'SPLIT'])('does not revoke a current positive %s provider initialization', async (reason) => {
  vi.stubGlobal('fetch', vi.fn(async () => fakeEvaluation(true, reason)));
  const { aiCreditsFlagQueryOptions } = await import('../feature-flags');
  const { subscribeAiFlagUnavailable } = await import('../ai-feature-flag-events');
  const revoke = vi.fn();
  const dispose = subscribeAiFlagUnavailable(revoke);
  try {
    expect(await aiCreditsFlagQueryOptions.queryFn?.({} as never)).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
  } finally { dispose(); }
});

it.each(['DISABLED', 'CACHED', 'STALE', 'UNKNOWN'])('rejects a true OFREP value with %s reason', async (reason) => {
  vi.stubGlobal('fetch', vi.fn(async () => fakeEvaluation(true, reason)));
  const { aiCreditsFlagQueryOptions } = await import('../feature-flags');
  expect(await aiCreditsFlagQueryOptions.queryFn?.({} as never)).toBe(false);
});

it('does not retain a prior true value after a provider error or wrong type', async () => {
  const fetch = vi.fn(async () => fakeEvaluation(true));
  vi.stubGlobal('fetch', fetch);
  const { aiCreditsFlagQueryOptions } = await import('../feature-flags');
  const evaluate = () => aiCreditsFlagQueryOptions.queryFn?.({} as never);
  expect(await evaluate()).toBe(true);
  fetch.mockImplementation(async () => new Response('{}', { status: 503 }));
  expect(await evaluate()).toBe(false);
  fetch.mockImplementation(async () => fakeEvaluation('true'));
  expect(await evaluate()).toBe(false);
});
