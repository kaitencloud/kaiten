import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { InstanceBilling, InvoicePreview } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetInstanceBilling,
  handleGetUpcomingInvoice,
  handleListInstanceInvoices,
} from '@/api-client/msw.gen';
import {
  buildInvoiceLine,
} from '../../../../../../../../e2e/app/_support/fixtures/build-invoice';
import {
  buildSubscription,
  buildUpcomingInvoice,
} from '../../../../../../../../e2e/app/_support/fixtures/build-subscription';
import { billingCapabilitiesProfiles } from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import {
  invoiceRow,
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { InstanceDetailBillingTab } from '../instance-detail-billing-tab';

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('../../../instance-detail-context', () => ({
  useInstanceDetail: () => detail.current,
}));
// Plain anchors that keep what the links carry, since the tab links with a search.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    params?: unknown;
    search?: unknown;
    to: string;
  }) => (
    <a
      {...props}
      data-params={JSON.stringify(params)}
      data-search={JSON.stringify(search)}
      href={to}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouter: () => ({
    buildLocation: ({
      params,
      to,
    }: {
      params: { invoiceId: string };
      to: string;
    }) => ({ pathname: to.replace('$invoiceId', params.invoiceId) }),
  }),
}));

useBillingTexts();

const INSTANCE = {
  id: 'ins-1',
  name: 'Globex Production',
  slug: 'globex-production',
};

const license = (lifecycleState: 'ARCHIVED' | 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') => ({
  lifecycleState,
  name: 'Business',
  slug: 'business',
  version: '2',
});

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'write:billing']));
  detail.current = {
    customer: { id: 'customer-1', name: 'Globex' },
    entitlementsRows: [
      {
        entitlementId: 'ent-api',
        entitlementName: 'API calls',
        entitlementSlug: 'api-calls',
        entitlementType: 'NUMBER',
      },
    ],
    instance: INSTANCE,
    license: license(),
  };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleListInstanceInvoices({ body: pageOf([]) }),
  );
});

const subscription = (overrides: Partial<Parameters<typeof buildSubscription>[0]> = {}) =>
  buildSubscription({
    anchorAt: '2026-08-28T00:00:00.000Z',
    currentPeriodEnd: '2026-10-27T00:00:00.000Z',
    currentPeriodStart: '2026-09-27T00:00:00.000Z',
    customerName: 'Globex',
    customerSlug: 'globex',
    instanceName: INSTANCE.name,
    instanceSlug: INSTANCE.slug,
    ...overrides,
  });

const serveSubscription = (value: InstanceBilling) =>
  server.use(handleGetInstanceBilling({ body: value }));

const notSubscribed = () =>
  server.use(
    handleGetInstanceBilling(() =>
      refusal(404, { code: 'GetInstanceBilling.NotFound', detail: 'No subscription' }),
    ),
  );

const upcoming = (overrides: Partial<Parameters<typeof buildUpcomingInvoice>[0]> = {}): InvoicePreview =>
  buildUpcomingInvoice({
    asOf: '2026-10-07T20:54:00.000Z',
    boundaryAt: '2026-10-27T00:00:00.000Z',
    lines: [
      buildInvoiceLine({
        amount: 9900,
        description: '1 × $99.00 per month',
        invoiceId: 'upcoming',
        label: 'Business, monthly',
        seq: 1,
        serviceFrom: '2026-10-27T00:00:00.000Z',
        serviceTo: '2026-11-27T00:00:00.000Z',
        type: 'BASE',
        unitAmountDecimal: '9900',
      }),
    ],
    serviceFrom: '2026-10-27T00:00:00.000Z',
    serviceTo: '2026-11-27T00:00:00.000Z',
    subtotal: 9900,
    total: 9900,
    ...overrides,
  });

const renderTab = () => renderWithClient(<InstanceDetailBillingTab />);

describe('an instance nobody bills yet', () => {
  beforeEach(() => notSubscribed());

  it('is a state of the tab and not an error, with the way to subscribe', async () => {
    renderTab();

    const empty = await screen.findByTestId('not-subscribed');
    expect(empty).toHaveTextContent('Not subscribed');
    expect(
      await within(empty).findByRole('link', { name: 'Subscribe' }),
    ).toHaveAttribute('href', '/customers/instances/$instanceSlug/billing/subscribe');
    expect(screen.queryByTestId('instance-billing-error')).toBeNull();
  });

  it('offers a session that may only read the state and no button', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    renderTab();

    const empty = await screen.findByTestId('not-subscribed');
    await waitFor(() =>
      expect(within(empty).queryByRole('link', { name: 'Subscribe' })).toBeNull(),
    );
    expect(within(empty).queryByRole('button', { name: 'Subscribe' })).toBeNull();
  });

  it('says why a version that is not published cannot be subscribed to, on a button that stays in the tab order', async () => {
    detail.current = { ...detail.current, license: license('DRAFT') };
    renderTab();

    const button = await screen.findByRole('button', { name: 'Subscribe' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('subscribe-unavailable')).toHaveTextContent(
      'This instance runs Business v2 (Draft). Only a published license version can be subscribed to.',
    );
    expect(button).toHaveAccessibleDescription(/Only a published license version/);
    expect(screen.queryByRole('link', { name: 'Subscribe' })).toBeNull();
  });
});

describe('a subscription', () => {
  it('says its status, who collects, the terms and where they come from, the price and the period, in UTC', async () => {
    serveSubscription(subscription());
    server.use(handleGetUpcomingInvoice({ body: upcoming() }));
    renderTab();

    expect(await screen.findByText('Subscription')).toBeInTheDocument();
    const card = screen.getByText('Subscription').closest('[data-slot="card"]') as HTMLElement;
    const scoped = within(card);
    expect(scoped.getByText('Active')).toBeInTheDocument();
    expect(scoped.getByText('Manual')).toBeInTheDocument();
    expect(scoped.getByText('Invoice sent to the customer')).toBeInTheDocument();
    expect(scoped.getByText('Payable within 30 days')).toBeInTheDocument();
    // Neither the method nor the terms are the contract's own.
    expect(scoped.getAllByText('Organization default')).toHaveLength(2);
    expect(scoped.getByText('Pro, monthly')).toBeInTheDocument();
    expect(scoped.getByText(/\$29\.00\/month/)).toBeInTheDocument();
    expect(scoped.getByText('Sep 27 – Oct 27, 2026 (UTC)')).toBeInTheDocument();
    expect(scoped.getByText('Aug 28, 2026 (UTC)')).toBeInTheDocument();
    expect(scoped.getByText('The period ends then and its invoice is composed.')).toBeInTheDocument();
  });

  it('marks the terms of this contract when it has its own', async () => {
    serveSubscription(subscription({ daysUntilDueOverride: 45 }));
    server.use(handleGetUpcomingInvoice({ body: upcoming() }));
    renderTab();

    const days = await screen.findByText('Payable within 45 days');
    expect(days.parentElement).toHaveTextContent('This contract');
  });

  it('says since when it is past due', async () => {
    serveSubscription(
      subscription({ pastDueSince: '2026-10-01T00:00:00.000Z', status: 'PAST_DUE' }),
    );
    server.use(handleGetUpcomingInvoice({ body: upcoming() }));
    renderTab();

    expect(await screen.findByText('Past due since')).toBeInTheDocument();
    expect(screen.getByText('Oct 1, 2026 (UTC)')).toBeInTheDocument();
  });

  it('shows what the next boundary will issue, and the lines of it on request', async () => {
    serveSubscription(subscription());
    server.use(handleGetUpcomingInvoice({ body: upcoming({ total: 10320 }) }));
    renderTab();

    const card = await screen.findByText('Upcoming invoice');
    const region = card.closest('[data-slot="card"]') as HTMLElement;
    expect(within(region).getByText('Renewal')).toBeInTheDocument();
    expect(within(region).getByText('Oct 27, 2026 (UTC)')).toBeInTheDocument();
    expect(within(region).getByText('1 line')).toBeInTheDocument();
    expect(within(region).getByText('$103.20')).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('button', { name: 'View the lines' }));

    const dialog = await screen.findByRole('dialog', { name: 'Upcoming invoice' });
    expect(within(dialog).getByText('Preview, not an invoice')).toBeInTheDocument();
    expect(within(dialog).getByText('Business, monthly')).toBeInTheDocument();
  });

  it('says an invoice would be held, names the meter and the check, and leads to its history', async () => {
    serveSubscription(subscription());
    server.use(
      handleGetUpcomingInvoice({
        body: upcoming({
          wouldHold: [{ entitlementId: 'ent-api', invariant: 'LEDGER_SEQUENCE_GAP' }],
        }),
      }),
    );
    renderTab();

    const banner = await screen.findByTestId('would-hold-banner');
    expect(banner).toHaveTextContent('This invoice would be held');
    expect(banner).toHaveTextContent('API calls: Usage reports are missing from the journal.');
    const link = within(banner).getByRole('link', { name: 'See its usage history' });
    expect(link).toHaveAttribute('href', '/customers/instances/$instanceSlug/entitlements');
    expect(link).toHaveAttribute('data-search', '{"history":"api-calls"}');
  });

  it('names a meter the instance no longer has by what it is, and leads nowhere', async () => {
    serveSubscription(subscription());
    server.use(
      handleGetUpcomingInvoice({
        body: upcoming({
          wouldHold: [{ entitlementId: 'ent-gone', invariant: 'LEDGER_CHAIN_BREAK' }],
        }),
      }),
    );
    renderTab();

    const banner = await screen.findByTestId('would-hold-banner');
    expect(banner).toHaveTextContent('An entitlement: The usage journal chain is broken.');
    expect(within(banner).queryByRole('link')).toBeNull();
  });

  it('lists the invoices of the instance without the column that says whose they are', async () => {
    serveSubscription(subscription());
    server.use(
      handleGetUpcomingInvoice({ body: upcoming() }),
      handleListInstanceInvoices({
        body: pageOf([invoiceRow('inv-1', 'Globex'), invoiceRow('inv-2', 'Globex')]),
      }),
    );
    renderTab();

    const count = await screen.findByTestId('instance-invoices-count');
    expect(count).toHaveTextContent('2 invoices shown');
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).not.toContain('Customer');
    expect(headers).toContain('Status');
  });

  it('shows a refusal of the upcoming invoice on its card with a way to ask again, and keeps the rest', async () => {
    serveSubscription(subscription());
    server.use(
      handleGetUpcomingInvoice(() =>
        refusal(422, {
          code: 'GetUpcomingInvoice.OutsideRetention',
          detail: 'Usage before 2025-04-15 is no longer kept',
        }),
      ),
    );
    renderTab();

    const problem = await screen.findByTestId('upcoming-invoice-error');
    expect(problem).toHaveTextContent('Usage before 2025-04-15 is no longer kept');
    expect(screen.getByText('Subscription')).toBeInTheDocument();
  });
});

describe('a subscription that ended', () => {
  it('says when and why, offers to subscribe again, and has no upcoming invoice', async () => {
    serveSubscription(
      subscription({
        canceledAt: '2026-06-01T00:00:00.000Z',
        cancellationReason: 'The contract was not renewed',
        status: 'CANCELED',
      }),
    );
    renderTab();

    expect(await screen.findByText('Canceled on')).toBeInTheDocument();
    expect(screen.getByText('Jun 1, 2026 (UTC)')).toBeInTheDocument();
    expect(screen.getByText('The contract was not renewed')).toBeInTheDocument();
    expect(screen.getByText(/This subscription has ended/)).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Subscribe' }),
    ).toHaveAttribute('href', '/customers/instances/$instanceSlug/billing/subscribe');
    expect(screen.queryByText('Upcoming invoice')).toBeNull();
    // The next boundary of a subscription that ended is nothing to wait for.
    expect(screen.queryByText('Next boundary')).toBeNull();
  });
});

describe('reading the billing of the instance', () => {
  it('is busy while the subscription is on the way', async () => {
    server.use(
      handleGetInstanceBilling(async () => {
        await delay('infinite');

        return HttpResponse.json(subscription());
      }),
    );
    renderTab();

    expect(screen.getByRole('status', { name: 'Loading billing' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows a refusal in the tab with a way to ask again, and asks again when told to', async () => {
    let calls = 0;
    server.use(
      handleGetInstanceBilling(() => {
        calls += 1;

        return calls === 1
          ? refusal(503, { detail: 'Billing is unavailable' })
          : HttpResponse.json(subscription());
      }),
      handleGetUpcomingInvoice({ body: upcoming() }),
    );
    renderTab();

    const problem = await screen.findByTestId('instance-billing-error');
    expect(problem).toHaveTextContent('Billing is unavailable');
    await userEvent.click(within(problem).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Subscription')).toBeInTheDocument();
  });

  it('does not ask a second time by itself: a refusal is the answer', async () => {
    let calls = 0;
    server.use(
      handleGetInstanceBilling(() => {
        calls += 1;

        return refusal(403, { code: 'Auth.MissingScope', detail: 'missing required scope: read:billing' });
      }),
    );
    renderTab();

    await screen.findByTestId('instance-billing-error');
    expect(calls).toBe(1);
  });
});
