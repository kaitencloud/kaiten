import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { testI18n } from '@/__tests__/test-i18n';
import type { Entitlement } from '@/api-client';
import { getEntitlementsUsageMetricsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { handleDeleteEntitlement } from '@/api-client/msw.gen';
import '@/lib/api/bootstrap';
import en from '@/lib/i18n/locales/en';
import { EntitlementTableActions } from '../entitlement-table-actions';

const router = vi.hoisted(() => ({
  queryClient: undefined as unknown as QueryClient,
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient: router.queryClient }),
}));
// What a license grants is another read: the delete is what is under test.
vi.mock('../../../hooks', () => ({
  useEntitlementLicenseLinks: () => ({
    isPending: false,
    linkedLicenseCount: 0,
  }),
}));

const instances = ['acme-prod', 'acme-dev'];
const usageOf = (instanceSlug: string) =>
  getEntitlementsUsageMetricsQueryKey({ path: { instanceSlug } });
const isStale = (instanceSlug: string) =>
  router.queryClient.getQueryState(usageOf(instanceSlug))?.isInvalidated;

const entitlement = (overrides: Partial<Entitlement>): Entitlement => ({
  createdAt: '2026-03-01T09:00:00.000Z',
  description: '',
  id: 'entitlement-1',
  name: 'Credits',
  slug: 'credits',
  type: 'NUMBER',
  updatedAt: '2026-03-01T09:00:00.000Z',
  usageSource: 'CALCULATED_USAGE',
  ...overrides,
});

async function confirmDeleteOf(subject: Entitlement) {
  render(
    <QueryClientProvider client={router.queryClient}>
      <EntitlementTableActions
        entitlement={subject}
        onDeleteRefused={() => false}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(toast.success).toHaveBeenCalled());
}

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  await testI18n.changeLanguage('en');
});

beforeEach(() => {
  router.queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  toast.success.mockClear();
  server.use(
    handleDeleteEntitlement(() => new HttpResponse(null, { status: 204 })),
  );
  // What the instances read of their entitlements, as the pages left it.
  for (const instance of instances) {
    router.queryClient.setQueryData(usageOf(instance), []);
  }
});

describe('deleting an entitlement from the table', () => {
  // A combined entitlement is a row of the usage of every instance that is granted one of its
  // sources, and has no counter to make the delete refuse: it must not stay on a page that
  // read the usage before, for the 30 seconds that a read is fresh.
  it('reads the usage of every instance again when it is a combined one', async () => {
    await confirmDeleteOf(
      entitlement({ usageSource: 'COMBINED_USAGE', slug: 'combined-credits' }),
    );

    await waitFor(() =>
      expect(instances.map(isStale)).toEqual([true, true]),
    );
  });

  it('leaves the usage of the instances alone when it is any other', async () => {
    await confirmDeleteOf(entitlement({}));

    expect(instances.map(isStale)).toEqual([false, false]);
  });
});
