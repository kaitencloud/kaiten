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
import { InvoicesViewSwitcher } from '../handoff/invoices-view-switcher';

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

const renderSwitcher = () =>
  renderWithClient(<InvoicesViewSwitcher />, createLoadedPageClient());

const links = () => screen.queryAllByRole('link');

/**
 * Waits until what decides the switch is known, the capabilities and the scopes of
 * the token, and says the switch is not drawn: not that it has not been drawn yet.
 */
async function expectNoSwitch(client: ReturnType<typeof renderSwitcher>['client']) {
  await waitFor(() => {
    expect(
      client.getQueryState(billingCapabilitiesQueryOptions.queryKey)?.status,
    ).not.toBe('pending');
    expect(client.getQueryState(grantedScopesQueryKey)?.status).toBe('success');
  });

  expect(links()).toHaveLength(0);
}

describe('the switch between every invoice and the handoff queue', () => {
  it('leads to each view of the list of invoices, and every invoice is the bare path', async () => {
    answerWith();
    renderSwitcher();

    expect(await screen.findByRole('link', { name: 'All' })).toHaveAttribute(
      'href',
      '/invoices',
    );
    expect(screen.getByRole('link', { name: 'Handoff' })).toHaveAttribute(
      'href',
      '/invoices?view=handoff',
    );
  });

  it('draws as the current one the view the URL asks for', async () => {
    answerWith();
    renderSwitcher();

    expect(await screen.findByRole('link', { name: 'All' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Handoff' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('draws the queue as the current view when the URL is the queue', async () => {
    location.search = { view: 'handoff' };
    answerWith();
    renderSwitcher();

    expect(await screen.findByRole('link', { name: 'Handoff' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'All' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('is not there while the capabilities are being read', async () => {
    answerWith();
    renderSwitcher();

    expect(links()).toHaveLength(0);

    await screen.findByRole('link', { name: 'All' });
  });

  it('is not there where billing is off, and the list is the list of invoices alone', async () => {
    // Billing is off by default: nothing is drawn once the capabilities are in.
    const { client } = renderSwitcher();

    await expectNoSwitch(client);
  });

  it('is not there where NoOp is not a way the organization collects', async () => {
    answerWith(
      billingCapabilities({ providers: [stripeProvider('connected')] }),
    );
    const { client } = renderSwitcher();

    await expectNoSwitch(client);
  });

  it('is not there for a session whose scopes do not cover reading the queue', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    answerWith();
    const { client } = renderSwitcher();

    await expectNoSwitch(client);
  });

  it('is there for a session that holds write:billing, which covers reading', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['write:billing']));
    answerWith();
    renderSwitcher();

    expect(await screen.findByRole('link', { name: 'Handoff' })).toBeVisible();
  });

  it('is read in French', async () => {
    await testI18n.changeLanguage('fr');
    try {
      answerWith();
      renderSwitcher();

      expect(
        await screen.findByRole('link', { name: 'Toutes' }),
      ).toHaveAttribute('href', '/invoices');
      expect(screen.getByRole('link', { name: 'Transmission' })).toHaveAttribute(
        'href',
        '/invoices?view=handoff',
      );
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});
