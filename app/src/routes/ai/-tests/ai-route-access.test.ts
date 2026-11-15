import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { aiAccessQueryOptions } from '@/domains/ai-credits';
import { Route as models } from '../../catalog/models/route';
import { Route as legacy } from '../route';
import { Route as usage } from '../../customers/instances/$instanceSlug/ai-usage';
import { Route as calculation } from '../../catalog/entitlements/$entitlementSlug/calculation';
import { Route as detail } from '../../catalog/entitlements/$entitlementSlug/route';
const { capability, flag, entitlement } = vi.hoisted(() => ({ capability: vi.fn<() => Promise<boolean>>(), flag: vi.fn<() => Promise<boolean>>(), entitlement: { type: 'NUMBER_AI_CREDIT', name: 'Pool' } }));
vi.mock('@/domains/ai-credits/ai-capabilities.api', () => ({ readAiCapability: capability }));
vi.mock('@/lib/feature-flags', () => ({ aiCreditsFlagQueryOptions: { queryFn: flag } }));
vi.mock('@/lib/session-identity', () => ({ getSessionIdentity: () => ({ userId: 'fixture', organizationId: 'organization' }) }));
vi.mock('@/features/ai', () => ({ AiCatalogueLayout: () => null }));
vi.mock('@/features/instances', () => ({ InstanceAiUsageTab: () => null }));
vi.mock('@/features/entitlements', () => ({ EntitlementDetailCalculationTab: () => null, EntitlementDetailPageContent: () => null, EntitlementFormDialog: () => null, entitlementQueryOptions: (slug: string) => ({ queryKey: ['fixture-entitlement', slug], queryFn: async () => entitlement }), entitlementGroupsQueryOptions: { queryKey: ['fixture-groups'], queryFn: async () => [] } }));
beforeEach(() => { capability.mockReset().mockResolvedValue(false); flag.mockReset().mockResolvedValue(true); entitlement.type = 'NUMBER_AI_CREDIT'; });
const cases = [
  { url: '/catalog/models/import', path: '/catalog/models', child: 'import', beforeLoad: models.options.beforeLoad },
  { url: '/catalog/models/existing/edit', path: '/catalog/models', child: '$modelSlug/edit', beforeLoad: models.options.beforeLoad },
  { url: '/ai/models/existing/edit', path: '/ai', child: 'models/$modelSlug/edit', beforeLoad: legacy.options.beforeLoad },
  { url: '/ai/matrix', path: '/ai', child: 'matrix', beforeLoad: legacy.options.beforeLoad },
  { url: '/catalog/entitlements/credits/calculation', path: '/catalog/entitlements/$entitlementSlug/calculation', child: undefined, beforeLoad: calculation.options.beforeLoad },
  { url: '/catalog/entitlements/credits?mode=configure', path: '/catalog/entitlements/$entitlementSlug', child: undefined, beforeLoad: detail.options.beforeLoad },
  { url: '/customers/instances/instance/ai-usage', path: '/customers/instances/$instanceSlug/ai-usage', child: undefined, beforeLoad: usage.options.beforeLoad },
];
async function load(testCase: (typeof cases)[number]) {
  const queryClient = new QueryClient(); queryClient.setQueryData(aiAccessQueryOptions().queryKey, { enabled: true, expiresAt: performance.now() + 30_000 });
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()();
  const loader = vi.fn(async () => null);
  const parent = createRoute({ getParentRoute: () => root, path: testCase.path, beforeLoad: async (options) => { await (testCase.beforeLoad as (options: unknown) => unknown)(options); }, ...(testCase.child ? {} : { loader }) });
  const tree = testCase.child ? parent.addChildren([createRoute({ getParentRoute: () => parent, path: testCase.child, loader })]) : parent;
  const router = createRouter({ routeTree: root.addChildren([tree]), context: { queryClient }, history: createMemoryHistory({ initialEntries: [testCase.url] }) });
  await router.load(); return loader;
}
it.each(cases)('denies existing deep URL $url before its operational loader even with cached true', async (testCase) => {
  const loader = await load(testCase); expect(loader).not.toHaveBeenCalled(); expect(capability).toHaveBeenCalled();
});
it('restores the route loader only with both successful true inputs', async () => {
  capability.mockResolvedValue(true); expect(await load(cases[0])).toHaveBeenCalledOnce();
});
it('keeps ordinary entitlement detail loaders usable while AI is off', async () => {
  entitlement.type = 'NUMBER'; expect(await load(cases[5])).toHaveBeenCalledOnce(); expect(capability).not.toHaveBeenCalled();
});
