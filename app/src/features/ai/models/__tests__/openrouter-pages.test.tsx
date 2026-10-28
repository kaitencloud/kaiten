import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import i18n from 'i18next';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import type { Model } from '@/api-client';
import { handleGetModel, handleUpdateModel, handleListModels, handleCreateModel } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import en from '@/lib/i18n/locales/en';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { modelsQueryOptions, AiNavigationProvider } from '@/domains/ai-credits';
import { ModelSourcePage } from '../model-source-page';
import { ModelImportPage } from '../model-import-page';
import { ModelForm } from '../model-form';
import { createOpenRouterImportDraft, type OpenRouterEntry } from '../openrouter-catalogue';
import { associateOpenRouterSource } from '../openrouter-sync';
import { wildcardQueryOptions } from '../../queries/ai-query-options';

const { fetchCatalogue, navigate } = vi.hoisted(() => ({ fetchCatalogue: vi.fn(), navigate: vi.fn() }));
vi.mock('../openrouter-catalogue', async original => ({ ...await original<typeof import('../openrouter-catalogue')>(), fetchOpenRouterCatalogue: fetchCatalogue }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate, Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a> }));
vi.mock('@/domains/ai-credits', async original => ({ ...await original<typeof import('@/domains/ai-credits')>(), invalidateAiQueries: vi.fn(async () => {}) }));
vi.mock('../../queries/ai-query-options', async original => ({ ...await original<typeof import('../../queries/ai-query-options')>(), invalidateAiQueries: vi.fn(async () => {}) }));
const date = '2026-10-23T12:00:00Z';
const entry: OpenRouterEntry = { id: 'provider/model-v1', canonicalSlug: 'provider/model-v1', name: 'Provider model', description: 'Source description', modality: 'TEXT', mappedVendorCosts: { currency: 'USD', perInputToken: '0.0000000001', perOutputToken: '0' }, rawPrices: { prompt: '1e-10', completion: '0' }, pricingStatus: 'fixed', issues: [] };
const initial: Model = { id: 'local-id', slug: 'local-model', name: 'Local model', vendor: 'Original supplier', modality: 'TEXT', status: 'ACTIVE', createdAt: date, updatedAt: date, externalIds: ['unrelated'], vendorCosts: { currency: 'USD', perInputToken: '0.000003', perOutputToken: '0.000002', perUnit: '7' }, metadata: associateOpenRouterSource({ userKey: 'preserve' }, entry.id, date) };
let fresh: Model;
let writes: Record<string, unknown>[];
function mount(child: ReactNode, scopes: string[] = ['read:models', 'write:models']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, scopes);
  client.setQueryData(modelsQueryOptions.queryKey, { items: [], hasMore: false });
  client.setQueryData(wildcardQueryOptions.queryKey, []);
  render(<QueryClientProvider client={client}><AiNavigationProvider context={{ entitlementSlug: 'credits', licenseSlug: 'pro-v2' }}>{child}</AiNavigationProvider></QueryClientProvider>);
}
beforeEach(async () => {
  fetchCatalogue.mockReset(); navigate.mockReset(); fetchCatalogue.mockResolvedValue([entry]); fresh = structuredClone(initial); writes = [];
  i18n.addResourceBundle('en', 'translation', en, true, true); await i18n.changeLanguage('en');
  server.use(handleGetModel(() => HttpResponse.json(fresh)), handleListModels(() => HttpResponse.json({ items: [], hasMore: false })), handleUpdateModel(async ({ request }) => { const body = await request.json() as Record<string, unknown>; writes.push(body); fresh = { ...fresh, ...body } as Model; return HttpResponse.json(fresh); }), handleCreateModel(async ({ request }) => { const body = await request.json() as Record<string, unknown>; writes.push(body); return HttpResponse.json({ ...initial, ...body }, { status: 201 }); }));
});
it('does not contact the provider on a source-page read; Check is read-only and selections start empty', async () => {
  mount(<ModelSourcePage modelSlug={initial.slug} />);
  await screen.findByRole('button', { name: 'Check pricing' });
  expect(fetchCatalogue).not.toHaveBeenCalled(); expect(writes).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Check pricing' }));
  const input = await screen.findByLabelText(/Per input token/);
  expect(input).not.toBeChecked(); expect(screen.getByLabelText(/Per output token/)).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Apply selected changes' })).toBeDisabled(); expect(writes).toEqual([]);
});
it('applies only selected exact prices and preserves fresh unselected costs and metadata', async () => {
  mount(<ModelSourcePage modelSlug={initial.slug} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check pricing' }));
  fireEvent.click(await screen.findByLabelText(/Per input token/));
  fresh.vendorCosts = { ...fresh.vendorCosts!, perOutputToken: '0.765432109876', perUnit: '9' };
  fresh.metadata = { ...fresh.metadata, concurrent: true };
  fireEvent.click(screen.getByRole('button', { name: 'Apply selected changes' }));
  await screen.findByText('Selected changes applied.');
  expect(writes[0]).toMatchObject({ name: initial.name, vendor: initial.vendor, status: 'ACTIVE', modality: 'TEXT', externalIds: ['unrelated'], vendorCosts: { perInputToken: '0.0000000001', perOutputToken: '0.765432109876', perUnit: '9' }, metadata: { userKey: 'preserve', concurrent: true, kaitenOpenRouterImport: { appliedPrices: { perInputToken: '0.0000000001' } } } });
  expect(writes[0]).not.toHaveProperty('rates');
});
it('retains selected fields on a preview conflict, without writing', async () => {
  mount(<ModelSourcePage modelSlug={initial.slug} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check pricing' }));
  const input = await screen.findByLabelText(/Per input token/); fireEvent.click(input);
  fresh.vendorCosts!.perInputToken = '0.123456789012';
  fireEvent.click(screen.getByRole('button', { name: 'Apply selected changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Check again'); expect(input).toBeChecked(); expect(writes).toEqual([]);
});
it('rejects review-required price patches while allowing explicitly selected source details', async () => {
  fetchCatalogue.mockResolvedValue([{ ...entry, pricingStatus: 'reviewRequired', issues: ['dynamicPricing'], mappedVendorCosts: { currency: 'USD' } }]);
  mount(<ModelSourcePage modelSlug={initial.slug} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check pricing' }));
  await screen.findByText(/Manual pricing required/); expect(screen.queryByLabelText(/Per input token/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/^Name/)); fireEvent.click(screen.getByRole('button', { name: 'Apply selected changes' }));
  await screen.findByText('Selected changes applied.'); expect(writes[0]?.vendorCosts).toEqual(initial.vendorCosts); expect(writes[0]?.name).toBe(entry.name);
});
it('does not infer a link from aliases; explicit linking preserves model fields and requires consent', async () => {
  fresh = { ...initial, externalIds: [entry.id], metadata: { userKey: true } };
  mount(<ModelSourcePage modelSlug={initial.slug} />);
  expect(await screen.findByText(/No provider source linked/)).toBeInTheDocument(); expect(fetchCatalogue).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Choose source' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
  await screen.findByLabelText(/Link this model/);
  expect(screen.getByRole('button', { name: 'Link source' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Link this model/)); fireEvent.click(screen.getByRole('button', { name: 'Link source' }));
  await screen.findByText('Selected changes applied.');
  expect(writes[0]).toMatchObject({ vendorCosts: initial.vendorCosts, externalIds: [entry.id], metadata: { userKey: true, kaitenOpenRouterImport: { sourceId: entry.id } } });
});
it('shows source gone without archiving, and keeps read-only checks available', async () => {
  fetchCatalogue.mockResolvedValue([]); mount(<ModelSourcePage modelSlug={initial.slug} />, ['read:models']);
  fireEvent.click(await screen.findByRole('button', { name: 'Check pricing' }));
  await screen.findByText(/Source model is no longer listed/); expect(writes).toEqual([]); expect(fresh.status).toBe('ACTIVE');
});
it('browses exact display prices and requires a known modality before reviewing an unknown model', async () => {
  fetchCatalogue.mockResolvedValue([{ ...entry, modality: null, mappedVendorCosts: { currency: 'USD' }, pricingStatus: 'reviewRequired', issues: ['unsupportedModality'] }]);
  mount(<ModelImportPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
  expect(await screen.findByText(/Manual pricing required/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Import model' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Choose a known model type'), { target: { value: 'AUDIO' } });
  await screen.findByRole('button', { name: 'Import model' }); expect(screen.getByLabelText('Modality')).toHaveTextContent('Audio'); expect(writes).toEqual([]);
});
it('imports through the single form only after consent, keeping edited costs separate from applied snapshots', async () => {
  mount(<ModelForm initialDraft={createOpenRouterImportDraft(entry)} sourceOrigin={{ entry, checkedAt: date }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import model' })); await screen.findByText('Confirm the source association before importing.'); expect(writes).toEqual([]);
  fireEvent.change(screen.getByLabelText('Per input token'), { target: { value: '0.000000000123' } });
  fireEvent.change(screen.getByLabelText('Provider identifiers (one per line)'), { target: { value: 'user-alias' } });
  fireEvent.click(screen.getByLabelText(/Import and link/)); fireEvent.click(screen.getByRole('button', { name: 'Import model' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ vendor: 'OpenRouter', status: 'ACTIVE', externalIds: ['user-alias', entry.id], vendorCosts: { perInputToken: '0.000000000123', perOutputToken: '0' }, metadata: { kaitenOpenRouterImport: { sourceId: entry.id, checkedAt: date } } });
  expect((writes[0]?.metadata as Record<string, Record<string, unknown>>).kaitenOpenRouterImport).not.toHaveProperty('appliedPrices');
});
it('refuses a whole-catalogue alias collision on import and retains the draft', async () => {
  server.use(handleListModels(() => HttpResponse.json({ items: [{ ...initial, externalIds: [entry.id] }], hasMore: false })));
  mount(<ModelForm initialDraft={createOpenRouterImportDraft(entry)} sourceOrigin={{ entry, checkedAt: date }} />);
  fireEvent.click(screen.getByLabelText(/Import and link/)); fireEvent.click(screen.getByRole('button', { name: 'Import model' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already registered'); expect(writes).toEqual([]); expect(screen.getByLabelText('Name')).toHaveValue(entry.name);
});

it('invalidates the old preview and selections when a later Check fails', async () => {
  mount(<ModelSourcePage modelSlug={initial.slug} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check pricing' }));
  fireEvent.click(await screen.findByLabelText(/Per input token/));
  expect(screen.getByRole('button', { name: 'Apply selected changes' })).toBeEnabled();
  fetchCatalogue.mockRejectedValueOnce(new Error('Public catalogue unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Check pricing' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Apply selected changes' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Per input token/)).not.toBeInTheDocument(); expect(writes).toEqual([]);
});
it('shows disappeared optional source prices as not listed, retaining saved prices without an unchanged claim', async () => {
  fresh = { ...initial, name: entry.name, description: entry.description, vendorCosts: { ...entry.mappedVendorCosts, perCachedInputToken: '0.000009' } };
  mount(<ModelSourcePage modelSlug={initial.slug} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check pricing' }));
  await screen.findByText('Some source prices are not listed. Saved prices are kept.');
  expect(screen.getByText(/Per cached input token · Not listed/)).toHaveTextContent('0.000009');
  expect(screen.queryByText('No available changes. Saved values are unchanged.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply selected changes' })).toBeDisabled(); expect(writes).toEqual([]);
  expect(fresh.vendorCosts?.perCachedInputToken).toBe('0.000009');
});
