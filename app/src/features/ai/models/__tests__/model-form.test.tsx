import { Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import i18n from 'i18next';
import en from '@/lib/i18n/locales/en';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Model } from '@/api-client';
import { handleCreateModel, handleUpdateModel } from '@/api-client/msw.gen';
import { ModelForm } from '../model-form';
import { wildcardQueryOptions } from '../../queries/ai-query-options';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock('../../queries/ai-query-options', async (original) => ({
  ...await original<typeof import('../../queries/ai-query-options')>(),
  invalidateAiQueries: vi.fn(async () => {}),
}));
beforeEach(() => navigate.mockClear());
const model = { id: 'test-model', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z', name: 'Synthetic model', slug: 'synthetic-model', vendor: 'Fixture vendor', modality: 'TEXT', status: 'ACTIVE', externalIds: ['provider-model'], metadata: { fixture: true }, vendorCosts: { currency: 'USD', perCacheWriteToken: '0.000002' } } as Model;
function renderForm(value?: Model) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(wildcardQueryOptions.queryKey, [{ licenseSlug: 'pro-v1', entitlementSlug: 'credits' }]);
  render(<QueryClientProvider client={client}><Suspense fallback={null}><ModelForm model={value} /></Suspense></QueryClientProvider>);
}
beforeEach(() => { configure({ asyncUtilTimeout: 30000 }); i18n.addResourceBundle('en', 'translation', en, true, true); void i18n.changeLanguage('en'); });
it('edits with immutable slug/modality and retains provider aliases, metadata and cache-write costs', async () => {
  let body: Record<string, unknown> | undefined;
  server.use(handleUpdateModel(async ({ request, params }) => { expect(params.modelSlug).toBe('synthetic-model'); body = await request.json() as Record<string, unknown>; return HttpResponse.json({ ...model, ...body }); }));
  renderForm(model);
  const name = await screen.findByLabelText('Name');
  expect(screen.getByLabelText('Slug')).toBeDisabled();
  expect(screen.getByLabelText('Modality')).toBeDisabled();
  fireEvent.change(name, { target: { value: 'Renamed fixture' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await waitFor(() => expect(body?.name).toBe('Renamed fixture'));
  expect(body).toMatchObject({ slug: model.slug, modality: 'TEXT', externalIds: ['provider-model'], metadata: { fixture: true }, vendorCosts: { currency: 'USD', perCacheWriteToken: '0.000002' } });
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/ai/models' }));
});
it('shows affected wildcard versions before creating and normalizes provider identifiers', async () => {
  let body: Record<string, unknown> | undefined;
  server.use(handleCreateModel(async ({ request }) => { body = await request.json() as Record<string, unknown>; return HttpResponse.json({ ...model, ...body }, { status: 201 }); }));
  renderForm();
  expect(await screen.findByText('pro-v1 / credits')).toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'New fixture' } });
  fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'new-fixture' } });
  fireEvent.change(screen.getByLabelText('Vendor'), { target: { value: 'Local fixture' } });
  fireEvent.change(screen.getByLabelText('Provider identifiers (one per line)'), { target: { value: '  alias-one\n\nalias-two ' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await waitFor(() => expect(body).toMatchObject({ slug: 'new-fixture', externalIds: ['alias-one', 'alias-two'], status: 'ACTIVE' }));
});
