import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { CheckoutSessionAdmin, PublishableKey } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetCheckoutSessionAdmin,
  handleListCheckoutSessions,
  handleListPublishableKeys,
} from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  buildCheckoutSession,
  buildPublishableKey,
} from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { CheckoutSessionsPageContent } from '..';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', () => ({
  Link: (
    props: {
      children?: unknown;
      params?: Record<string, string>;
      search?: (previous: object) => Record<string, string>;
      to: string;
    } & Record<string, unknown>,
  ) => {
    const { children, params, search, to, ...rest } = props;
    const path = Object.entries(params ?? {}).reduce(
      (result, [name, value]) => result.replace(`$${name}`, value),
      to,
    );
    const query = new URLSearchParams(search?.({})).toString();

    return (
      <a {...(rest as object)} href={query ? `${path}?${query}` : path}>
        {children as never}
      </a>
    );
  },
  useLocation: ({
    select,
  }: {
    select: (state: { pathname: string; search: object }) => unknown;
  }) => select({ pathname: '/customers/checkout-sessions', search: {} }),
  useNavigate: () => navigate,
}));

useBillingTexts();

const READ = ['read:billing', 'read:publishable_keys'];

const SESSIONS: CheckoutSessionAdmin[] = [
  buildCheckoutSession({
    createdAt: '2026-10-07T11:00:00.000Z',
    email: 'dana@hooli.test',
    sessionId: 'cs-open',
    status: 'OPEN',
  }),
  buildCheckoutSession({
    clientReferenceId: 'cmp-17',
    createdAt: '2026-10-06T10:00:00.000Z',
    customerSlug: 'bought-online',
    email: 'alice@acme.test',
    instanceSlug: 'bought-online-prod',
    sessionId: 'cs-completed',
    status: 'COMPLETED',
  }),
  buildCheckoutSession({
    clientReferenceId: 'cmp-42',
    createdAt: '2026-10-01T08:00:00.000Z',
    customerSlug: 'lapsed-buyer',
    email: 'finance@globex.test',
    instanceSlug: 'lapsed-buyer-prod',
    sessionId: 'cs-expired',
    status: 'EXPIRED',
  }),
];

const KEYS: PublishableKey[] = [
  buildPublishableKey({
    anonymousCheckout: true,
    id: 'pk-checkout',
    label: 'Checkout page',
  }),
];

function serve({
  keys = KEYS,
  sessions = SESSIONS,
}: { keys?: PublishableKey[]; sessions?: CheckoutSessionAdmin[] } = {}) {
  const keyReads: string[] = [];

  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleListCheckoutSessions({
      body: { hasMore: false, items: sessions },
    }),
    handleGetCheckoutSessionAdmin(({ params }) => {
      const session = sessions.find(({ sessionId }) => sessionId === params.sessionId);

      return session
        ? HttpResponse.json(session)
        : refusal(404, {
            code: 'GetCheckoutSessionAdmin.NotFound',
            detail: 'checkout session not found',
          });
    }),
    handleListPublishableKeys(({ request }) => {
      keyReads.push(request.url);

      return HttpResponse.json({ hasMore: false, items: keys });
    }),
  );

  return keyReads;
}

const onOpen = vi.fn();
const onClose = vi.fn();

function page(search: { session?: string; status?: string } = {}) {
  return renderWithClient(
    <Suspense fallback={null}>
      <CheckoutSessionsPageContent
        onClose={onClose}
        onOpen={onOpen}
        search={search}
      />
    </Suspense>,
  );
}

const row = (text: string) =>
  screen.getByRole('row', { name: new RegExp(text) });

beforeEach(() => {
  navigate.mockReset();
  onOpen.mockReset();
  onClose.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(READ));
});

describe('the list of checkouts', () => {
  it('lists every checkout with who started it, what it asks for and what it created', async () => {
    serve();
    page();

    expect(await screen.findByRole('row', { name: /dana@hooli.test/ })).toBeVisible();
    const completed = row('alice@acme.test');
    expect(within(completed).getByText('Completed')).toBeVisible();
    expect(within(completed).getByText('cmp-17')).toBeVisible();
    expect(within(completed).getByText('Monthly')).toBeVisible();
    expect(within(completed).getByText('€49.00')).toBeVisible();
    expect(within(completed).getByRole('link', { name: 'bought-online' })).toHaveAttribute(
      'href',
      '/customers/bought-online',
    );
    expect(
      within(completed).getByRole('link', { name: 'bought-online-prod' }),
    ).toHaveAttribute('href', '/customers/instances/bought-online-prod/billing');
    expect(within(row('dana@hooli.test')).getAllByRole('link')).toHaveLength(1);
  });

  it('names the key whose page started a checkout, by its label once the keys are read', async () => {
    serve();
    page();

    await waitFor(() =>
      expect(within(row('dana@hooli.test')).getByText('Checkout page')).toBeVisible(),
    );
  });

  it('says on an expired checkout that its customer and instance stay', async () => {
    serve();
    page();

    expect(
      within(await screen.findByRole('row', { name: /finance@globex.test/ })).getByText(
        'Stays after expiry',
      ),
    ).toBeVisible();
    expect(within(row('alice@acme.test')).queryByText('Stays after expiry')).toBeNull();
  });

  it('opens the panel of a checkout from its row, whose e-mail is the link to it, and not from the other links in it', async () => {
    serve();
    page();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /alice@acme.test/ }));
    expect(onOpen).toHaveBeenCalledWith('cs-completed');
    expect(
      within(row('alice@acme.test')).getByRole('link', { name: 'alice@acme.test' }),
    ).toHaveAttribute('href', '/customers/checkout-sessions?session=cs-completed');

    onOpen.mockClear();
    await user.click(within(row('alice@acme.test')).getByRole('link', { name: 'bought-online' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('narrows in the browser by the search, and says when nothing matches', async () => {
    serve();
    page();
    const user = userEvent.setup();

    await screen.findByRole('row', { name: /dana@hooli.test/ });
    await user.type(screen.getByPlaceholderText(/Search by email/), 'cmp-42');

    await waitFor(() => expect(screen.getAllByRole('row', { name: /@/ })).toHaveLength(1));
    expect(row('finance@globex.test')).toBeVisible();

    await user.clear(screen.getByPlaceholderText(/Search by email/));
    await user.type(screen.getByPlaceholderText(/Search by email/), 'nobody');
    expect(await screen.findByTestId('checkout-sessions-filtered-empty')).toBeVisible();
  });

  it('opens already narrowed on the status a link names', async () => {
    serve();
    page({ status: 'expired' });

    expect(await screen.findByRole('row', { name: /finance@globex.test/ })).toBeVisible();
    expect(screen.queryByRole('row', { name: /dana@hooli.test/ })).toBeNull();
  });

  it('says there is no checkout when the organization has none', async () => {
    serve({ sessions: [] });
    page();

    expect(await screen.findByTestId('checkout-sessions-empty')).toHaveTextContent(
      'No checkout yet',
    );
  });

  it('asks the API for no key, and shows the id, for a session that may not read them', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    const keyReads = serve();
    page();

    expect(await screen.findByRole('row', { name: /dana@hooli.test/ })).toBeVisible();
    expect(within(row('dana@hooli.test')).getByText('pk-checkout')).toBeVisible();
    expect(keyReads).toEqual([]);
  });

  it('shows the id of a key the list does not hold', async () => {
    serve({ keys: [] });
    page();

    await screen.findByRole('row', { name: /dana@hooli.test/ });
    await waitFor(() =>
      expect(within(row('dana@hooli.test')).getByText('pk-checkout')).toBeVisible(),
    );
  });
});

describe('the panel of a checkout', () => {
  it('reads the checkout from the API and shows what it returns', async () => {
    serve();
    page({ session: 'cs-completed' });

    const detail = await screen.findByTestId('checkout-session-detail');
    expect(within(detail).getByText('alice@acme.test')).toBeVisible();
    expect(within(detail).getByText('cmp-17')).toBeVisible();
    expect(within(detail).getByText('price-pro-monthly')).toBeVisible();
    expect(within(detail).getByRole('link', { name: 'bought-online' })).toBeVisible();
    expect(within(detail).getByTestId('checkout-session-due-today')).toHaveTextContent('€49.00');
    expect(screen.queryByTestId('checkout-session-expired-note')).toBeNull();
  });

  it('shows the busy state while the checkout is on its way', async () => {
    serve();
    page({ session: 'cs-completed' });

    expect(await screen.findByRole('status', { name: 'Loading the checkout' })).toBeVisible();
    expect(await screen.findByTestId('checkout-session-detail')).toBeVisible();
  });

  it('says on an expired checkout that its customer and instance remain, for the vendor to delete', async () => {
    serve();
    page({ session: 'cs-expired' });

    expect(await screen.findByTestId('checkout-session-expired-note')).toHaveTextContent(
      'for you to delete',
    );
  });

  it('says a checkout is gone, as the API answers 404 for one it deleted', async () => {
    serve();
    page({ session: 'cs-deleted' });

    expect(await screen.findByTestId('checkout-session-gone')).toHaveTextContent(
      'no longer exists',
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows the words of the API for any other refusal, with a retry that reads again', async () => {
    serve();
    let refused = true;
    server.use(
      handleGetCheckoutSessionAdmin(({ params }) =>
        refused
          ? refusal(503, { detail: 'The checkouts are not available right now' })
          : HttpResponse.json(
              SESSIONS.find(({ sessionId }) => sessionId === params.sessionId) as never,
            ),
      ),
    );
    page({ session: 'cs-open' });
    const user = userEvent.setup();

    expect(await screen.findByText('The checkouts are not available right now')).toBeVisible();
    refused = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('checkout-session-detail')).toBeVisible();
  });

  it('closes by dropping the checkout from the address', async () => {
    serve();
    page({ session: 'cs-open' });
    const user = userEvent.setup();

    await screen.findByTestId('checkout-session-detail');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the tabs of the section', () => {
  it('list the checkouts beside the customers and the instances where billing offers them', async () => {
    serve();
    page();

    await screen.findByRole('row', { name: /dana@hooli.test/ });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Checkouts' })).toHaveAttribute(
        'href',
        '/customers/checkout-sessions',
      ),
    );
    expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute('href', '/customers');
    expect(screen.getByRole('link', { name: 'Instances' })).toHaveAttribute(
      'href',
      '/customers/instances',
    );
  });
});
