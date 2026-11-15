import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import i18n from 'i18next';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import type { ConversionRule, Entitlement } from '@/api-client';
import { handleCreateConversionRule, handleListConversionRules, handleGetLicenses, handleListModels, handleListEntitlements } from '@/api-client/msw.gen';
import { listConversionRulesQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { server } from '@/__tests__/msw-server';
import { modelsQueryOptions } from '@/domains/ai-credits';
import { allLicensesOptions } from '@/lib/api/all-pages-query-options';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import en from '@/lib/i18n/locales/en';
import { EntitlementDetailCalculationTab } from '../entitlement-detail-calculation-tab';

vi.mock('@/domains/ai-credits/ai-query-options', async (original) => ({ ...await original<Record<string, unknown>>(), invalidateAiQueries: vi.fn(async () => {}) }));
const entitlement = { id: 'pool', slug: 'credits', name: 'AI pool', type: 'NUMBER_AI_CREDIT', aggregationMethod: 'SUM' } as Entitlement;
vi.mock('../entitlement-detail-context', () => ({ useEntitlementDetailContext: () => ({ entitlement }) }));
const rule = { id: 'addon-rule', licenseSlug: 'pro-v2', entitlementSlug: 'credits', modelSlug: null, requestType: null, status: 'ACTIVE', grantedByLicense: false, rates: { perRequest: '0.0000001234' }, minimumCreditsPerRequest: '0', maximumCreditsPerRequest: null, chargeOnError: 'NEVER' } as ConversionRule;
beforeEach(async () => { i18n.addResourceBundle('en', 'translation', en, true, true); await i18n.changeLanguage('en'); });

async function renderCalculation({ flag = true, scopes = null, search = '?licenseSlug=pro-v2', seedRules = true }: {
  flag?: boolean; scopes?: readonly string[] | null; search?: string; seedRules?: boolean;
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  setAiAccessInputsForTest(client, { capability: true, flag });
  client.setQueryData(grantedScopesQueryKey, scopes);
  client.setQueryData(allLicensesOptions().queryKey, { items: [{ id: 'one', slug: 'pro-v1', name: 'Pro', version: '1', createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', description: '', type: 'PAID', isDefault: false }, { id: 'two', slug: 'pro-v2', name: 'Pro', version: '2', createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', description: '', type: 'PAID', isDefault: true }], hasMore: false });
  client.setQueryData(modelsQueryOptions.queryKey, { items: [], hasMore: false });
  if (seedRules) client.setQueryData(listConversionRulesQueryKey({ path: { licenseSlug: 'pro-v2' }, query: { entitlementSlug: 'credits', status: 'ACTIVE' } }), [rule]);
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: '/catalog/entitlements/$entitlementSlug/calculation', component: TestRoute });
  function TestRoute() {
    const selection = route.useSearch() as { licenseSlug?: string; rule?: string };
    const navigate = route.useNavigate();
    return <EntitlementDetailCalculationTab {...selection} onSelectionChange={(next) => { void navigate({ search: next }); }} />;
  }
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/catalog/entitlements/credits/calculation' + search] }) });
  await router.load();
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { client, router };
}

it('keeps add-on-only rules and exact pool/version through create, cancel and save', async () => {
  let body: Record<string, unknown> | undefined;
  let path: unknown;
  let entitlementReads = 0;
  server.use(handleCreateConversionRule(async ({ request, params }) => { body = await request.json() as Record<string, unknown>; path = params; return HttpResponse.json({ ...rule, ...body }); }), handleListEntitlements(() => { entitlementReads++; return HttpResponse.json({ items: [], hasMore: false }); }));
  const { router } = await renderCalculation();
  expect(await screen.findByText(/No direct allowance/)).toBeInTheDocument();
  expect(screen.getByText('0.0000001234 Credits')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
  const form = await screen.findByRole('form');
  expect(within(form).getByText('AI pool')).toBeInTheDocument();
  expect(within(form).queryByLabelText('Credit pool')).not.toBeInTheDocument();
  expect(router.state.location.search).toEqual({ licenseSlug: 'pro-v2', rule: 'new' });
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(router.state.location.search).toEqual({ licenseSlug: 'pro-v2' }));
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
  fireEvent.change(await screen.findByLabelText('Per request'), { target: { value: '0.0000009876' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(body).toMatchObject({ entitlementSlug: 'credits', modelSlug: null, requestType: null, rates: { perRequest: '0.0000009876', perInputToken: null } }));
  expect(path).toMatchObject({ licenseSlug: 'pro-v2' });
  await waitFor(() => expect(router.state.location.search).toEqual({ licenseSlug: 'pro-v2' }));
  expect(entitlementReads).toBe(0);
  await router.history.back();
  await waitFor(() => expect(router.state.location.search).toEqual({ licenseSlug: 'pro-v2', rule: 'new' }));
});

it('reads only the selected version with the entitlement filter and retains false direct grants', async () => {
  const reads: string[] = [];
  server.use(handleListConversionRules(({ request }) => { reads.push(request.url); return HttpResponse.json([rule]); }));
  await renderCalculation({ seedRules: false, scopes: ['read:licenses'] });
  expect(await screen.findByText(/No direct allowance/)).toBeInTheDocument();
  expect(reads).toHaveLength(1);
  expect(new URL(reads[0]).pathname).toMatch(/licenses\/pro-v2\/conversion-rules$/);
  expect(new URL(reads[0]).searchParams.get('entitlementSlug')).toBe('credits');
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
});

it.each([{ flag: false, scopes: null }, { flag: true, scopes: ['read:entitlements'] }])('does not start configuration reads when unavailable or denied (%j)', async ({ flag, scopes }) => {
  let reads = 0;
  server.use(handleGetLicenses(() => { reads++; return HttpResponse.json({ items: [], hasMore: false }); }), handleListModels(() => { reads++; return HttpResponse.json({ items: [], hasMore: false }); }), handleListConversionRules(() => { reads++; return HttpResponse.json([]); }));
  const { client } = await renderCalculation({ flag, scopes, seedRules: false });
  if (flag) await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('cannot read calculation'));
  else expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('License version')).not.toBeInTheDocument();
  expect(client.getQueryCache().findAll({ queryKey: listConversionRulesQueryKey({ path: { licenseSlug: 'pro-v2' }, query: { entitlementSlug: 'credits', status: 'ACTIVE' } }) })).toHaveLength(0);
  expect(reads).toBe(0);
  expect(client.getQueryCache().find({ queryKey: allLicensesOptions().queryKey })?.getObserversCount()).toBe(0);
  expect(client.getQueryCache().find({ queryKey: modelsQueryOptions.queryKey })?.getObserversCount()).toBe(0);
});

it('does not read rules before a version is selected', async () => {
  let reads = 0;
  server.use(handleListConversionRules(() => { reads++; return HttpResponse.json([]); }));
  await renderCalculation({ search: '', seedRules: false });
  expect(await screen.findByRole('status')).toHaveTextContent('Choose a license version');
  expect(reads).toBe(0);
});

it('switches one pool between two exact plan versions without scanning other rules', async () => {
  const reads: string[] = [];
  server.use(handleListConversionRules(({ params }) => {
    reads.push(params.licenseSlug);
    return HttpResponse.json([{ ...rule, licenseSlug: params.licenseSlug, rates: { perRequest: params.licenseSlug === 'pro-v1' ? '1' : '2' } }]);
  }));
  const { router } = await renderCalculation({ seedRules: false, scopes: ['read:licenses'] });
  expect(await screen.findByText('2 Credits')).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: 'Pro · 1 · pro-v1' }));
  expect(await screen.findByText('1 Credits')).toBeInTheDocument();
  expect(router.state.location.search).toEqual({ licenseSlug: 'pro-v1' });
  expect(reads).toEqual(['pro-v2', 'pro-v1']);
});
