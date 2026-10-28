import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import i18n from 'i18next';
import en from '@/lib/i18n/locales/en';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import type { ConversionRule } from '@/api-client';
import { handleUpdateConversionRule } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import { allEntitlementsOptions } from '@/lib/api/all-pages-query-options';
import { modelsQueryOptions } from '../../queries/ai-query-options';
import { RuleForm } from '../rule-form';
vi.mock('@/domains/ai-credits/ai-query-options', async (original) => ({ ...await original<Record<string, unknown>>(), invalidateAiQueries: vi.fn(async () => {}) }));
beforeEach(() => { configure({ asyncUtilTimeout: 30000 }); i18n.addResourceBundle('en', 'translation', en, true, true); void i18n.changeLanguage('en'); });
it('keeps wildcard identity, clears a guard with null and sends only the rate vector', async () => {
  const rule = { id: 'rule-fixture', licenseSlug: 'pro-v1', entitlementSlug: 'credits', modelSlug: null, requestType: null, rates: { perRequest: '1', perInputToken: '0.01' }, minimumCreditsPerRequest: '0', maximumCreditsPerRequest: '5', chargeOnError: 'NEVER', status: 'ACTIVE', grantedByLicense: false } as ConversionRule;
  let body: Record<string, unknown> | undefined;
  const saved = vi.fn();
  server.use(handleUpdateConversionRule(async ({ request, params }) => { expect(params.ruleId).toBe(rule.id); body = await request.json() as Record<string, unknown>; return HttpResponse.json({ ...rule, ...body }); }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(allEntitlementsOptions().queryKey, { items: [{ id: 'pool', description: '', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z', slug: 'credits', name: 'Credits', type: 'NUMBER_AI_CREDIT', aggregationMethod: 'SUM' }], hasMore: false });
  client.setQueryData(modelsQueryOptions.queryKey, { items: [], hasMore: false });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  render(<QueryClientProvider client={client}><Suspense fallback={null}><RuleForm licenseSlug="pro-v1" rule={rule} onSaved={saved} /></Suspense></QueryClientProvider>);
  expect(await screen.findByLabelText('Credit pool')).toBeDisabled();
  expect(screen.getByLabelText('Model')).toBeDisabled();
  expect(screen.getByLabelText('Request type')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Maximum credits per request (blank = no cap)'), { target: { value: '' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await waitFor(() => expect(body).toMatchObject({ modelSlug: null, requestType: null, entitlementSlug: 'credits', maximumCreditsPerRequest: null, rates: { perRequest: '1', perInputToken: '0.01', perSecond: null } }));
  expect(body).not.toHaveProperty('conversionType');
  await waitFor(() => expect(saved).toHaveBeenCalled());
});

function renderRuleEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(allEntitlementsOptions().queryKey, { items: [{ id: 'pool', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z', description: '', slug: 'credits', name: 'Credits', type: 'NUMBER_AI_CREDIT', aggregationMethod: 'SUM' }], hasMore: false });
  client.setQueryData(modelsQueryOptions.queryKey, { items: [], hasMore: false });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  render(<QueryClientProvider client={client}><RuleForm licenseSlug="pro-v1" rule={{ id: 'fixture', entitlementSlug: 'credits', rates: { perRequest: '0.1234567891', perInputToken: '0.0000000001', perCachedInputToken: '0' }, chargeOnError: 'NEVER', minimumCreditsPerRequest: '0' } as ConversionRule} onSaved={vi.fn()} /></QueryClientProvider>);
}
it('qualifies cached blank/zero pricing and requires explicit confirmation before replacing customized rates', async () => {
  renderRuleEditor();
  const request = await screen.findByLabelText('Per request');
  expect(request).toHaveValue('0.1234567891');
  expect(screen.getByLabelText('Per cached input token')).toHaveValue('0');
  expect(screen.getByLabelText('Per cached input token')).toHaveAccessibleDescription('Blank inherits the input-token rate; explicit 0 is free.');
  expect(screen.getByText(/Blank = unpriced/)).toHaveTextContent('Blank cache rates inherit input');
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Rate vector preset'));
  await user.click(await screen.findByRole('option', { name: 'Per request' }));
  expect(screen.getByLabelText('Rate vector preset')).toHaveTextContent('Per request');
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(request).toHaveValue('0.1234567891');
  expect(screen.getByText(/Replace all current rates/)).toHaveTextContent('all other dimensions are cleared');
  const confirmation = screen.getByRole('group', { name: 'Replace rates' });
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
  expect(request).toHaveValue('0.1234567891');
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  fireEvent.click(screen.getByRole('button', { name: 'Replace rates' }));
  expect(request).toHaveValue('1');
  expect(screen.getByLabelText('Per input token')).toHaveValue('');
  expect(screen.getByLabelText('Per cached input token')).toHaveValue('');
  expect(screen.getByLabelText('Rate vector preset')).toHaveTextContent('Per request');
});
it('retains exact edited rates when saving fails and presents an inline error', async () => {
  server.use(handleUpdateConversionRule(() => HttpResponse.json({ message: 'Fixture write unavailable' }, { status: 503 })));
  renderRuleEditor();
  const request = await screen.findByLabelText('Per request');
  fireEvent.change(request, { target: { value: '0.9876543210' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
  expect(request).toHaveValue('0.9876543210');
  expect(screen.getByRole('form', { name: 'pro-v1 — Edit rule' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
});

it('suppresses the shared general editor’s pool read when scopes are known denied', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, ['write:licenses', 'read:models']);
  client.setQueryData(modelsQueryOptions.queryKey, { items: [], hasMore: false });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  render(<QueryClientProvider client={client}><RuleForm licenseSlug="pro-v1" onSaved={vi.fn()} /></QueryClientProvider>);
  expect(await screen.findByRole('status')).toHaveTextContent('cannot select a credit pool');
  expect(client.getQueryCache().find({ queryKey: allEntitlementsOptions().queryKey })?.isActive()).toBe(false);
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});

it('keeps initial priced dimensions including zero upfront and reopens invalid additional rates', async () => {
  renderRuleEditor();
  expect((await screen.findByLabelText('Per request')).closest('details')).toBeNull();
  expect(screen.getByLabelText('Per cached input token').closest('details')).toBeNull();
  const additional = screen.getByLabelText('Per second');
  expect(additional.closest('details')).not.toHaveAttribute('open');
  fireEvent.change(additional, { target: { value: '-1' } });
  await waitFor(() => expect(additional.closest('details')).toHaveAttribute('open'));
  await waitFor(() => expect(additional).toHaveFocus());
  expect(screen.getByText(/Reservations are estimates/)).toBeVisible();
});
