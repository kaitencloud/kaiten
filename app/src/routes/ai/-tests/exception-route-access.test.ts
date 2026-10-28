import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router';
import { HttpResponse } from 'msw';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleListEntitlementExceptions } from '@/api-client/msw.gen';
import { aiAccessQueryOptions } from '@/domains/ai-credits';
import '@/lib/api/bootstrap';
import { Route as revoke } from '../../customers/instances/$instanceSlug/entitlements/exceptions/$exceptionId/revoke';

const { capability, flag } = vi.hoisted(() => ({ capability: vi.fn(), flag: vi.fn() }));
vi.mock('@/domains/ai-credits/ai-capabilities.api', () => ({ readAiCapability: capability }));
vi.mock('@/lib/feature-flags', () => ({ aiCreditsFlagQueryOptions: { queryFn: flag } }));
vi.mock('@/lib/session-identity', () => ({ getSessionIdentity: () => ({ userId: 'fixture', organizationId: 'organization' }) }));
vi.mock('@/features/instances', async (original) => {
  const { requireExceptionAccess } = await original<typeof import('@/features/instances')>();
  return { requireExceptionAccess, EndExceptionDialog: () => null };
});
beforeEach(() => {
  capability.mockReset().mockResolvedValue(true);
  flag.mockReset().mockResolvedValue(false);
});
async function load(entitlementType: 'NUMBER_AI_CREDIT' | 'NUMBER' | 'BOOLEAN' | 'CONFIG') {
  server.use(handleListEntitlementExceptions(() => HttpResponse.json([{ id: 'exception', entitlementSlug: 'target', entitlementType }])));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(aiAccessQueryOptions().queryKey, { enabled: true, expiresAt: performance.now() + 30000 });
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()();
  const loader = vi.fn(async () => null);
  const route = createRoute({ getParentRoute: () => root, path: '/customers/instances/$instanceSlug/entitlements/exceptions/$exceptionId/revoke', beforeLoad: async (options) => {
    await (revoke.options.beforeLoad as (options: unknown) => unknown)(options);
  }, loader });
  const router = createRouter({ routeTree: root.addChildren([route]), context: { queryClient }, history: createMemoryHistory({ initialEntries: ['/customers/instances/instance/entitlements/exceptions/exception/revoke'] }) });
  await router.load();
  queryClient.clear();
  return loader;
}
it('denies an existing AI exception deep link before its loader with true capability, false flag and cached true', async () => {
  expect(await load('NUMBER_AI_CREDIT')).not.toHaveBeenCalled();
  expect(capability).toHaveBeenCalledOnce();
  expect(flag).toHaveBeenCalledOnce();
});
it('restores the classified AI deep link only with both true inputs', async () => {
  flag.mockResolvedValue(true);
  expect(await load('NUMBER_AI_CREDIT')).toHaveBeenCalledOnce();
});
it.each(['NUMBER', 'BOOLEAN', 'CONFIG'] as const)('keeps an ordinary %s exception route usable without AI readiness reads', async (type) => {
  expect(await load(type)).toHaveBeenCalledOnce();
  expect(capability).not.toHaveBeenCalled();
});
