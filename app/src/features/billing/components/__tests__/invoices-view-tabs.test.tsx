import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { billingCapabilitiesQueryOptions } from '@/domains/billing';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  createLoadedPageClient,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
  stripeProvider,
} from '../../../../../e2e/app/_support/model/billing-capabilities';
import type { InvoiceScope } from '../../schemas/invoice-scope.schema';
import type { InvoicesView } from '../../schemas/invoices-search.schema';
import type { InvoicesViewCounts } from '../../utils/invoice-views';
import { InvoicesViewTabs } from '../invoices/invoices-view-tabs';

const getAuthToken = vi.hoisted(() => vi.fn());
// Where the page is, which the links follow: a test moves it to the other view.
const location = vi.hoisted(() => ({
  pathname: '/invoices',
  search: {} as Record<string, unknown>,
}));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
    location,
  ),
);

useBillingTexts();

beforeEach(() => {
  location.search = {};
  // A session that reads billing, as an administrator and a finance reader do.
  getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
});

const answerWith = (capabilities = billingCapabilitiesProfiles.stack()) =>
  server.use(handleGetBillingCapabilities({ body: capabilities }));

const COUNTS = { acknowledged: 4, all: 12, held: 2, overdue: 0, waiting: 5 };

const renderTabs = (
  scope: InvoiceScope = {},
  view: InvoicesView = 'all',
  counts: InvoicesViewCounts | null = COUNTS,
) =>
  renderWithClient(
    <InvoicesViewTabs counts={counts ?? undefined} scope={scope} view={view} />,
    createLoadedPageClient(),
  );

const links = () => screen.queryAllByRole('link');

/**
 * Waits until what decides whether the queue's tabs are drawn is known, the
 * capabilities and the scopes of the token, and says they are not: not that they have
 * not been drawn yet.
 */
async function expectNoQueueTabs(client: ReturnType<typeof renderTabs>['client']) {
  await waitFor(() => {
    expect(
      client.getQueryState(billingCapabilitiesQueryOptions.queryKey)?.status,
    ).not.toBe('pending');
    expect(client.getQueryState(grantedScopesQueryKey)?.status).toBe('success');
  });

  expect(screen.queryByRole('link', { name: /^Handoff \d+$/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /Acknowledged/ })).toBeNull();
  expect(screen.getByRole('link', { name: /All/ })).toBeVisible();
}

describe('the status views of the invoices', () => {
  it('lead to each view of the list, each with its count, and every invoice is the bare path', async () => {
    answerWith();
    renderTabs();

    // The tabs of the queue come once the capabilities and the scopes are read.
    await screen.findByRole('link', { name: 'Handoff 5' });

    expect(screen.getByRole('link', { name: 'All 12' })).toHaveAttribute(
      'href',
      '/invoices',
    );
    expect(screen.getByRole('link', { name: 'Overdue 0' })).toHaveAttribute(
      'href',
      '/invoices?view=overdue',
    );
    expect(screen.getByRole('link', { name: 'Held 2' })).toHaveAttribute(
      'href',
      '/invoices?view=held',
    );
    expect(
      screen.getByRole('link', { name: 'Handoff 5' }),
    ).toHaveAttribute('href', '/invoices?view=waiting');
    expect(screen.getByRole('link', { name: 'Acknowledged 4' })).toHaveAttribute(
      'href',
      '/invoices?view=acknowledged',
    );
  });

  it('are drawn in the order All, Overdue, Held, Waiting, Acknowledged', async () => {
    answerWith();
    renderTabs();

    await screen.findByRole('link', { name: /Acknowledged/ });

    expect(links().map((link) => link.textContent)).toEqual([
      'All 12',
      'Overdue 0',
      'Held 2',
      'Handoff 5',
      'Acknowledged 4',
    ]);
  });

  it('keep the scope of the list on the views of invoices, and drop it on the queue', async () => {
    answerWith();
    renderTabs({ customerSlug: 'initech' });

    await screen.findByRole('link', { name: 'Handoff' });

    expect(screen.getByRole('link', { name: 'All 12' })).toHaveAttribute(
      'href',
      '/invoices?customerSlug=initech',
    );
    expect(screen.getByRole('link', { name: 'Held 2' })).toHaveAttribute(
      'href',
      '/invoices?customerSlug=initech&view=held',
    );
    expect(screen.getByRole('link', { name: 'Handoff' })).toHaveAttribute(
      'href',
      '/invoices?view=waiting',
    );
  });

  it('count the queue only for the whole organization: in a scoped list the queue tabs have no count', async () => {
    answerWith();
    renderTabs({ instanceSlug: 'initech-production' });

    await screen.findByRole('link', { name: 'Handoff' });

    expect(links().map((link) => link.textContent)).toEqual([
      'All 12',
      'Overdue 0',
      'Held 2',
      'Handoff',
      'Acknowledged',
    ]);
  });

  it('have no counts while the list of invoices is being read or was refused', async () => {
    answerWith();
    renderTabs({}, 'all', null);

    await screen.findByRole('link', { name: 'Handoff' });

    expect(links().map((link) => link.textContent)).toEqual([
      'All',
      'Overdue',
      'Held',
      'Handoff',
      'Acknowledged',
    ]);
  });

  it('draw as the current one the view the URL asks for', async () => {
    location.search = { view: 'held' };
    answerWith();
    renderTabs();

    expect(await screen.findByRole('link', { name: 'Held 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'All 12' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('draw All as the current one on the bare path', async () => {
    answerWith();
    renderTabs();

    expect(await screen.findByRole('link', { name: 'All 12' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('draw a part of the queue as the current one when the URL is that part', async () => {
    location.search = { view: 'acknowledged' };
    answerWith();
    renderTabs();

    expect(
      await screen.findByRole('link', { name: 'Acknowledged 4' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'All 12' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('are All, Overdue and Held while the capabilities are being read', async () => {
    answerWith();
    renderTabs();

    expect(links().map((link) => link.textContent)).toEqual([
      'All 12',
      'Overdue 0',
      'Held 2',
    ]);

    await screen.findByRole('link', { name: /^Handoff \d+$/ });
  });

  it('are All, Overdue and Held where billing is off', async () => {
    // Billing is off by default: the queue's tabs are not drawn once the capabilities are in.
    const { client } = renderTabs();

    await expectNoQueueTabs(client);
    expect(links()).toHaveLength(3);
  });

  it('keep the tab of the queue the page is on, and mark it, where the queue is not offered', async () => {
    location.search = { view: 'waiting' };
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    answerWith();
    const { client } = renderTabs({}, 'waiting');

    await waitFor(() => {
      expect(client.getQueryState(grantedScopesQueryKey)?.status).toBe(
        'success',
      );
    });

    expect(links().map((link) => link.textContent)).toEqual([
      'All 12',
      'Overdue 0',
      'Held 2',
      'Handoff 5',
    ]);
    expect(screen.getByRole('link', { name: 'Handoff 5' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'All 12' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('have no queue where NoOp is not a way the organization collects', async () => {
    answerWith(
      billingCapabilities({ providers: [stripeProvider('connected')] }),
    );
    const { client } = renderTabs();

    await expectNoQueueTabs(client);
  });

  it('have no queue for a session whose scopes do not cover reading it', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    answerWith();
    const { client } = renderTabs();

    await expectNoQueueTabs(client);
  });

  it('have the queue for a session that holds write:billing, which covers reading', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['write:billing']));
    answerWith();
    renderTabs();

    expect(
      await screen.findByRole('link', { name: 'Handoff 5' }),
    ).toBeVisible();
  });

  it('are read in French', async () => {
    await testI18n.changeLanguage('fr');
    try {
      answerWith();
      renderTabs();

      await screen.findByRole('link', { name: 'Transmission 5' });

      expect(screen.getByRole('link', { name: 'Toutes 12' })).toHaveAttribute(
        'href',
        '/invoices',
      );
      expect(screen.getByRole('link', { name: 'En retard 0' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Bloquées 2' })).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Transmission 5' }),
      ).toHaveAttribute('href', '/invoices?view=waiting');
      expect(screen.getByRole('link', { name: 'Acquittées 4' })).toBeVisible();
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});
