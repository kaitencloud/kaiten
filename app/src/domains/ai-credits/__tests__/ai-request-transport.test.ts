import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { client } from '@/api-client/client.gen';
import { ApiError } from '@/lib/errors/api-error';
import { aiAccessQueryOptions, AI_ACCESS_FRESHNESS_MS } from '../ai-access';
import { subscribeAiAccess } from '../ai-request-guard';

vi.mock('@/lib/session-identity', () => ({
  getSessionIdentity: () => ({ userId: 'fixture', organizationId: 'organization' }),
}));

let dispose: (() => void) | undefined;
let requestObserver: ((request: Request) => Request) | undefined;
afterEach(() => {
  dispose?.();
  if (requestObserver) client.interceptors.request.eject(requestObserver);
  requestObserver = undefined;
  vi.restoreAllMocks();
});

function install() {
  const queryClient = new QueryClient();
  dispose = subscribeAiAccess(queryClient);
  queryClient.setQueryData([{ _id: 'listEntitlements' }], {
    items: [{ slug: 'credits', type: 'NUMBER_AI_CREDIT' }],
  });
  return queryClient;
}

function write(method: 'POST' | 'PUT', body: unknown, fetch: typeof globalThis.fetch) {
  return client.request({
    baseUrl: 'http://api.test/api', url: '/customers', method,
    headers: { 'Content-Type': 'application/json' },
    body, bodySerializer: JSON.stringify, fetch, throwOnError: true,
  });
}

it.each(['POST', 'PUT'] as const)('leaves an ordinary %s request and its serialized bytes untouched', async (method) => {
  let original: Request | undefined;
  requestObserver = (request) => { original = request; return request; };
  client.interceptors.request.use(requestObserver);
  install();
  const body = {
    name: 'Ordinary customer', billingEmail: 'ap@example.test',
    metadata: { type: 'NUMBER_AI_CREDIT', arbitrary: 'models' },
    count: '9007199254740993', nullable: null,
  };
  const clone = vi.spyOn(Request.prototype, 'clone');
  const json = vi.spyOn(Request.prototype, 'json');
  const text = vi.spyOn(Request.prototype, 'text');
  const arrayBuffer = vi.spyOn(Request.prototype, 'arrayBuffer');
  const formData = vi.spyOn(Request.prototype, 'formData');
  const blob = vi.spyOn(Request.prototype, 'blob');
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;
    expect(request).toBe(original);
    expect(request.bodyUsed).toBe(false);
    for (const reader of [clone, json, text, arrayBuffer, formData, blob])
      expect(reader).not.toHaveBeenCalled();
    // Read only in the fake transport, after checking the guard touched no stream.
    expect(await request.text()).toBe(JSON.stringify(body));
    return Response.json({ saved: true });
  });
  await expect(write(method, body, fetch)).resolves.toMatchObject({ data: { saved: true } });
  expect(fetch).toHaveBeenCalledOnce();
  expect(body.metadata.type).toBe('NUMBER_AI_CREDIT');
});

it.each([
  { type: 'NUMBER_AI_CREDIT' },
  { value: { type: 'ai_usage' } },
  { entitlementSlug: 'credits' },
  { meteredEntitlementSlug: 'credits' },
  { metered: { entitlementSlug: 'credits' } },
])('rejects typed AI body %j from generated options before transport, without reading its stream', async (body) => {
  install();
  const clone = vi.spyOn(Request.prototype, 'clone');
  const json = vi.spyOn(Request.prototype, 'json');
  const text = vi.spyOn(Request.prototype, 'text');
  const fetch = vi.fn<typeof globalThis.fetch>();
  await expect(write('POST', body, fetch)).rejects.toThrow('AIUsage.Disabled');
  expect(fetch).not.toHaveBeenCalled();
  expect(clone).not.toHaveBeenCalled();
  expect(json).not.toHaveBeenCalled();
  expect(text).not.toHaveBeenCalled();
});

it('still cancels an admitted typed AI write when access is revoked', async () => {
  const queryClient = install();
  queryClient.setQueryData(aiAccessQueryOptions().queryKey, {
    enabled: true, expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS,
  });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;
    expect(request.signal.aborted).toBe(false);
    expect(await request.text()).toBe('{"value":{"type":"ai_usage"}}');
    queryClient.setQueryData(aiAccessQueryOptions().queryKey, { enabled: false, expiresAt: 0 });
    expect(request.signal.aborted).toBe(true);
    return Response.json({ saved: true });
  });
  await write('POST', { value: { type: 'ai_usage' } }, fetch);
  expect(fetch).toHaveBeenCalledOnce();
});

it('revokes access after the configured error interceptor receives AIUsage.Disabled', async () => {
  // App bootstrap normalizes the generated client's raw response before this guard.
  const normalize = (error: unknown, response?: Response) => new ApiError({ data: error, response, status: response?.status });
  client.interceptors.error.use(normalize);
  const queryClient = install();
  queryClient.setQueryData(aiAccessQueryOptions().queryKey, {
    enabled: true, expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS,
  });
  const fetch = vi.fn(async () => Response.json({ code: 'AIUsage.Disabled' }, { status: 403 }));
  try {
    await expect(write('POST', { type: 'NUMBER_AI_CREDIT' }, fetch)).rejects.toMatchObject({ data: { code: 'AIUsage.Disabled' } });
    expect(queryClient.getQueryData(aiAccessQueryOptions().queryKey)).toMatchObject({ enabled: false });
  } finally {
    client.interceptors.error.eject(normalize);
  }
});
