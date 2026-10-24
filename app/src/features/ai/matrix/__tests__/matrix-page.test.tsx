import { AiNavigationProvider, type AiNavigationContext } from '@/domains/ai-credits';
import { getEntitlementOptions, getLicenseOptions } from '@/api-client/@tanstack/react-query.gen';
import type { Entitlement } from '@/api-client';
import { aiCreditsFlagQueryOptions } from '@/lib/feature-flags';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import i18n from 'i18next';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import type { ConversionRule, License, LicenseFamilyView } from '@/api-client';
import type { AiMatrixQuery } from '@/api-client/graphql/graphql';
import { handleUpdateConversionRule } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import { allEntitlementsOptions, allLicenseFamiliesOptions } from '@/lib/api/all-pages-query-options';
import en from '@/lib/i18n/locales/en';
import { MatrixPage } from '../matrix-page';
import { matrixQueryOptions, modelsQueryOptions } from '../../queries/ai-query-options';
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock('@/domains/ai-credits/ai-query-options', async (original) => ({ ...await original<Record<string, unknown>>(), invalidateAiQueries: vi.fn(async () => {}) }));
beforeEach(async () => { i18n.addResourceBundle('en', 'translation', en, true, true); await i18n.changeLanguage('en'); });
const rule = { id: 'rule-fixture', licenseSlug: 'pro-v1', entitlementSlug: 'credits', modelSlug: null, requestType: null, rates: { perRequest: '0.0000000001' }, minimumCreditsPerRequest: '0', maximumCreditsPerRequest: null, chargeOnError: 'NEVER', status: 'ACTIVE', grantedByLicense: false } as ConversionRule;
function renderMatrix(withMatrix = true, context: AiNavigationContext = {}, scopes: readonly string[] | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(aiCreditsFlagQueryOptions.queryKey, true);
  client.setQueryData(grantedScopesQueryKey, scopes);
  client.setQueryData(allLicenseFamiliesOptions().queryKey, { items: [{ id: 'family', slug: 'pro', currentVersion: { name: 'Pro' } as License } as LicenseFamilyView], hasMore: false });
  client.setQueryData(allEntitlementsOptions().queryKey, { items: [{ id: 'credits', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z', description: '', slug: 'credits', name: 'Credits', type: 'NUMBER_AI_CREDIT', aggregationMethod: 'SUM' }], hasMore: false });
  client.setQueryData(modelsQueryOptions.queryKey, { items: [], hasMore: false });
  const data = { models: [], licenseFamily: { id: 'family', slug: 'pro', versions: [{ id: 'v1', slug: 'pro-v1', name: 'Pro', version: '1', versionName: 'First version', lifecycleState: 'PUBLISHED', entitlements: [], conversionRules: [rule] }] } } as AiMatrixQuery;
  if (context.entitlementSlug) client.setQueryData(getEntitlementOptions({ path: { entitlementSlug: context.entitlementSlug } }).queryKey, { id: 'credits', slug: 'credits', name: 'Credits', type: 'NUMBER_AI_CREDIT', aggregationMethod: 'SUM' } as Entitlement);
  if (context.licenseSlug) client.setQueryData(getLicenseOptions({ path: { licenseSlug: context.licenseSlug } }).queryKey, { id: 'v1', slug: context.licenseSlug, familyId: 'family' } as License);
  if (withMatrix) client.setQueryData(matrixQueryOptions('pro').queryKey, data);
  else client.setQueryDefaults(matrixQueryOptions('pro').queryKey, { queryFn: () => new Promise(() => {}) });
  render(<QueryClientProvider client={client}><AiNavigationProvider context={context}><MatrixPage /></AiNavigationProvider></QueryClientProvider>);
  return client;
}
it('names the inline editor, transfers focus on opening, and returns focus on Cancel and Save without changing precision', async () => {
  let body: Record<string, unknown> | undefined;
  server.use(handleUpdateConversionRule(async ({ request }) => { body = await request.json() as Record<string, unknown>; return HttpResponse.json({ ...rule, ...body }); }));
  renderMatrix();
  expect(screen.getByText('pro-v1')).toBeInTheDocument();
  expect(screen.getByText('Published')).toBeInTheDocument();
  expect(screen.getByText('0.0000000001 Credits')).toHaveClass('tabular-nums');
  const region = screen.getByRole('region', { name: 'Conversion matrix' });
  expect(region).toHaveAttribute('tabindex', '0');
  const edit = within(region).getByRole('button', { name: 'Edit' });
  edit.focus(); fireEvent.click(edit);
  const heading = await screen.findByRole('heading', { name: 'pro-v1 — Edit rule' });
  await waitFor(() => expect(heading).toHaveFocus());
  const form = screen.getByRole('form', { name: 'pro-v1 — Edit rule' });
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
  expect(within(region).getByRole('button', { name: 'Edit' })).toHaveFocus();
  fireEvent.click(within(region).getByRole('button', { name: 'Edit' }));
  fireEvent.change(await screen.findByLabelText('Per request'), { target: { value: '0.0000000002' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
  expect(body).toMatchObject({ modelSlug: null, requestType: null, rates: { perRequest: '0.0000000002', perCachedInputToken: null } });
  expect(within(region).getByRole('button', { name: 'Edit' })).toHaveFocus();
});
it('retains add-on-only pricing and explains the complete rule and pending-commit effects', async () => {
  renderMatrix();
  expect(screen.getByText(en.AI.Matrix.notGranted)).toBeInTheDocument();
  expect(screen.getByText(en.AI.Matrix.wholeRule)).toBeInTheDocument();
  expect(screen.getByText(en.AI.Matrix.minimum)).toBeInTheDocument();
  expect(screen.getByText(en.AI.Matrix.noPerRequestCap)).toBeInTheDocument();
  expect(screen.getByText(en.AI.Matrix.chargeOnError)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(en.AI.Matrix.archiveWarning);
});
it('provides a scoped pending matrix state instead of an empty-table claim', () => {
  renderMatrix(false);
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Loading version and model conversion rules');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('opens contextual comparison on the selected version’s family and keeps the entitlement fixed in its shared editor', async () => {
  const client = renderMatrix(true, { entitlementSlug: 'credits', licenseSlug: 'pro-v1' });
  expect(screen.getByText('Back to entitlement')).toBeInTheDocument();
  expect(screen.getByText('pro-v1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
  const form = await screen.findByRole('form');
  expect(within(form).getByText('Credits')).toBeInTheDocument();
  expect(within(form).queryByLabelText('Credit pool')).not.toBeInTheDocument();
  expect(client.getQueryCache().find({ queryKey: allEntitlementsOptions().queryKey })?.getObserversCount()).toBe(1);
  // Fixed mode observes the existing catalogue query disabled; it does not refetch it.
  expect(client.getQueryCache().find({ queryKey: allEntitlementsOptions().queryKey })?.isActive()).toBe(false);
});

it('does not offer an uncontextual pool editor when entitlement-list permission is known denied', () => {
  renderMatrix(true, {}, ['write:licenses', 'read:models']);
  expect(screen.getByText('0.0000000001 Credits')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
});
