import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n from 'i18next';
import { HttpResponse } from 'msw/http';
import { Suspense } from 'react';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { getEntitlementsUsageMetricsOptions } from '@/api-client/@tanstack/react-query.gen';
import {
  handleListAiInferences,
  handleListAiReservations,
  handleListModels,
} from '@/api-client/msw.gen';
import { allEntitlementsOptions } from '@/lib/api/all-pages-query-options';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import en from '@/lib/i18n/locales/en';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { InstanceAiUsageTab } from '../ai-usage-tab';

// The tab keeps its state in the URL; here the URL is a plain object.
const url = vi.hoisted(() => ({ search: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
  useSearch: () => url.search,
  useNavigate: () => (options: { search: (previous: Record<string, unknown>) => Record<string, unknown> }) => {
    url.search = options.search(url.search);
  },
}));
vi.mock('../../instance-detail-context', () => ({
  useInstanceDetail: () => ({ instance: { slug: 'fixture-instance' } }),
}));

beforeEach(() => {
  configure({ asyncUtilTimeout: 30000 });
  url.search = {};
  i18n.addResourceBundle('en', 'translation', en, true, true);
  void i18n.changeLanguage('en');
});

const record = {
  transactionId: 'first',
  status: 'COMMITTED',
  model: 'synthetic-model',
  requestType: 'COMPLETION',
  reportedAt: '2026-10-19T10:00:00Z',
  requestStatus: 'SUCCESS',
  authorized: true,
  credits: { computed: '1.123456', charged: '1.123456' },
  usage: { inputTokens: 100 },
  valueBefore: 3,
  valueAfter: 4.123456,
};

function renderTab(scopes: readonly string[] | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, scopes);
  client.setQueryData(allEntitlementsOptions().queryKey, {
    items: [{ id: 'pool', name: 'Credits', description: '', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z', slug: 'credits', type: 'NUMBER_AI_CREDIT' }],
    hasMore: false,
  });
  client.setQueryData(
    getEntitlementsUsageMetricsOptions({ path: { instanceSlug: 'fixture-instance' } }).queryKey,
    [{ entitlementId: 'pool', entitlementSlug: 'credits', licenseSlug: 'pro-v1', licenseId: 'license', source: 'addon', limitCapExceededOveragePercent: 20, reserved: '2.500000', value: { type: 'number', value: 4.123456 }, limit: { type: 'number', value: 10 } }],
  );
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <InstanceAiUsageTab />
      </Suspense>
    </QueryClientProvider>,
  );
}

it('shows the balance with overage, open holds and cursor-complete inferences, with no native select', async () => {
  const cursors: (string | null)[] = [];
  server.use(
    handleListModels(() => HttpResponse.json({ items: [], hasMore: false })),
    handleListAiReservations(() =>
      HttpResponse.json({ items: [{ ...record, transactionId: 'reservation', status: 'RESERVED', expiresAt: '2026-10-19T11:00:00Z', credits: { reserved: '2.500000' } }] }),
    ),
    handleListAiInferences(({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      cursors.push(cursor);
      return HttpResponse.json(
        cursor
          ? { items: [{ ...record, transactionId: 'older', model: 'unknown-model', authorized: false, status: 'RELEASED', denialReason: 'UNKNOWN_MODEL', credits: { computed: '0', charged: '0' } }], hasMore: false }
          : { items: [record], hasMore: true, nextCursor: 'older-cursor' },
      );
    }),
  );
  const { container } = renderTab();

  // An add-on-only pool has no licence grant to query; use its effective policy.
  expect(await screen.findByText('12')).toBeInTheDocument();
  expect(container.querySelector('select')).toBeNull();
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuemax', '12');
  const holds = await screen.findByRole('region', { name: en.AI.Usage.reservations });
  expect(within(holds).getAllByText('2.50').length).toBeGreaterThan(0);
  fireEvent.click(await screen.findByRole('button', { name: en.AI.Usage.more }));
  expect(await screen.findByText('unknown-model')).toBeInTheDocument();
  expect(cursors).toEqual([null, 'older-cursor']);
});

it('opens a receipt through the URL instead of a raw record dialog', async () => {
  server.use(
    handleListModels(() => HttpResponse.json({ items: [], hasMore: false })),
    handleListAiReservations(() => HttpResponse.json({ items: [] })),
    handleListAiInferences(() => HttpResponse.json({ items: [record], hasMore: false })),
  );
  renderTab();

  fireEvent.click(await screen.findByRole('button', { name: 'Open the receipt of first' }));
  await waitFor(() => expect(url.search).toMatchObject({ receipt: 'first' }));
});

it('sends model, request type and authorization to the API and shows what it answers', async () => {
  url.search = { auth: 'no', model: 'nope', type: 'COMPLETION' };
  const asked: Record<string, string>[] = [];
  server.use(
    handleListModels(() => HttpResponse.json({ items: [], hasMore: false })),
    handleListAiReservations(() => HttpResponse.json({ items: [] })),
    handleListAiInferences(({ request }) => {
      asked.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({
        items: [{ ...record, transactionId: 'denied', model: 'nope', authorized: false, status: 'RELEASED', denialReason: 'NO_RULE' }],
        hasMore: false,
      });
    }),
  );
  renderTab();

  expect(await screen.findByText('Loaded: 1')).toBeInTheDocument();
  expect(asked[0]).toMatchObject({ authorized: 'false', model: 'nope', requestType: 'COMPLETION' });
  // What is shown is what the API answered: no "in N loaded rows".
  expect(screen.queryByText(/Showing/)).toBeNull();
});

it('does not ask for the model catalogue of a session that may not read models, and shows the rows all the same', async () => {
  let asked = 0;
  server.use(
    handleListModels(() => {
      asked += 1;
      return HttpResponse.json({ code: 'Forbidden', status: 403, title: 'Forbidden' }, { status: 403 });
    }),
    handleListAiReservations(() => HttpResponse.json({ items: [] })),
    handleListAiInferences(() => HttpResponse.json({ items: [record], hasMore: false })),
  );
  renderTab(['read:instances', 'read:entitlements']);

  expect((await screen.findAllByText('synthetic-model')).length).toBeGreaterThan(0);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(asked).toBe(0);
});
