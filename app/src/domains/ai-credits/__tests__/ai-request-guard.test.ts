import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { aiAccessQueryOptions, AI_ACCESS_FRESHNESS_MS } from '../ai-access';
import { subscribeAiAccess } from '../ai-request-guard';
const { requestHooks, responseHooks, errorHooks } = vi.hoisted(() => ({ requestHooks: new Set<(request: Request) => Promise<Request>>(), responseHooks: new Set<(response: Response, request: Request) => Response>(), errorHooks: new Set<(error: unknown) => unknown>() }));
vi.mock('@/api-client/client.gen', () => ({ client: { getConfig: () => ({ baseUrl: 'http://api.test/api' }), interceptors: {
  request: { use: (fn: (request: Request) => Promise<Request>) => requestHooks.add(fn), eject: (fn: (request: Request) => Promise<Request>) => requestHooks.delete(fn) },
  response: { use: (fn: (response: Response, request: Request) => Response) => responseHooks.add(fn), eject: (fn: (response: Response, request: Request) => Response) => responseHooks.delete(fn) },
  error: { use: (fn: (error: unknown) => unknown) => errorHooks.add(fn), eject: (fn: (error: unknown) => unknown) => errorHooks.delete(fn) },
} } }));
vi.mock('@/lib/session-identity', () => ({ getSessionIdentity: () => ({ userId: 'fixture', organizationId: 'organization' }) }));
beforeEach(() => { requestHooks.clear(); responseHooks.clear(); errorHooks.clear(); });
function install() {
  const client = new QueryClient(); const dispose = subscribeAiAccess(client);
  return { client, dispose, request: [...requestHooks][0] };
}
it.each(['/models', '/models/model', '/licenses/pro/conversion-rules', '/instances/instance/entitlements/credits/usage/inferences', '/instances/instance/entitlements/credits/usage/reservations'])('blocks %s before the transport when off', async (path) => {
  const { request, dispose } = install(); const transport = vi.fn();
  await expect(request(new Request(`http://api.test/api${path}`)).then(transport)).rejects.toThrow('AIUsage.Disabled');
  expect(transport).not.toHaveBeenCalled(); dispose();
});
it('allows immutable reports/export while live AI targets and nested meters remain blocked', async () => {
  const { client, request, dispose } = install();
  client.setQueryData([{ _id: 'listEntitlements' }], { items: [{ slug: 'credits', type: 'NUMBER_AI_CREDIT' }] });
  for (const suffix of ['reports', 'reports/export']) await expect(request(new Request(`http://api.test/api/instances/instance/entitlements/credits/usage/${suffix}`))).resolves.toBeInstanceOf(Request);
  await expect(request(new Request('http://api.test/api/entitlements/credits'))).rejects.toThrow();
  await expect(request(new Request('http://api.test/api/licenses/pro/prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meteredEntitlementSlug: 'credits' }) }))).rejects.toThrow();
  dispose();
});
it('rejects stale true and cancels in-flight AI requests/query data after denial, not a fresh background check', async () => {
  const { client, request, dispose } = install(); const options = aiAccessQueryOptions();
  client.setQueryData(options.queryKey, { enabled: true, expiresAt: performance.now() - 1 }, { updatedAt: Date.now() - AI_ACCESS_FRESHNESS_MS - 1 });
  await expect(request(new Request('http://api.test/api/models'))).rejects.toThrow();
  client.setQueryData(options.queryKey, { enabled: true, expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS });
  client.setQueryData([{ _id: 'listModels' }], { items: ['sensitive AI state'] });
  const admitted = await request(new Request('http://api.test/api/models'));
  expect(admitted.signal.aborted).toBe(false);
  client.setQueryData(options.queryKey, { enabled: false, expiresAt: 0 });
  expect(admitted.signal.aborted).toBe(true);
  expect(client.getQueryData([{ _id: 'listModels' }])).toBeUndefined();
  dispose();
});
it('closes immediately when the local feature flag refresh invalidates its query', () => {
  const { client, dispose } = install(); client.setQueryData(aiAccessQueryOptions().queryKey, { enabled: true, expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS });
  client.setQueryData(['feature-flags', 'ai-credits'], true);
  void client.invalidateQueries({ queryKey: ['feature-flags'] });
  expect(client.getQueryData(aiAccessQueryOptions().queryKey)).toMatchObject({ enabled: false }); dispose();
});

it('expires and aborts already-admitted requests even when no new cache event arrives', async () => {
  vi.useFakeTimers();
  const { client, request, dispose } = install();
  client.setQueryData(aiAccessQueryOptions().queryKey, { enabled: true, expiresAt: performance.now() + 50 });
  const admitted = await request(new Request('http://api.test/api/models'));
  expect(admitted.signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(51);
  expect(admitted.signal.aborted).toBe(true);
  expect(client.getQueryData(aiAccessQueryOptions().queryKey)).toMatchObject({ enabled: false });
  dispose(); vi.useRealTimers();
});

it.each(['/feature-flags/models', '/customers/models', '/entitlements/models', '/feature-flags/conversion-rules'])('preserves ordinary %s instead of classifying its slug as an AI operation', async (path) => {
  const { request, dispose } = install();
  await expect(request(new Request(`http://api.test/api${path}`))).resolves.toBeInstanceOf(Request);
  dispose();
});
