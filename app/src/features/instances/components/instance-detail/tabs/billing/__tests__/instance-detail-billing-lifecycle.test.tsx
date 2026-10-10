import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import type { InstanceBilling } from '@/api-client';
import {
  handleCancelPlanChange,
  handleGetBillingCapabilities,
  handleGetInstanceBilling,
  handleGetUpcomingInvoice,
  handleListInstanceInvoices,
  handleReactivateSubscription,
} from '@/api-client/msw.gen';
import {
  invoiceRow,
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
} from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { buildUpcomingInvoice } from '../../../../../../../../e2e/app/_support/fixtures/build-subscription';
import { InstanceDetailBillingTab } from '../instance-detail-billing-tab';
import {
  BUSINESS_V3_MONTHLY,
  INSTANCE,
  servePlans,
  subscription,
} from './lifecycle-fixtures';

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../../instance-detail-context', () => ({
  useInstanceDetail: () => detail.current,
}));
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
  useNavigate: () => navigate,
  useRouter: () => ({
    buildLocation: ({ params, to }: { params: { invoiceId: string }; to: string }) => ({
      pathname: to.replace('$invoiceId', params.invoiceId),
    }),
  }),
}));

useBillingTexts();

/** The day the tab is read: the days left of a trial and the days past due count from it. */
const NOW = new Date('2026-10-07T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  toast.error.mockReset();
  toast.success.mockReset();
  navigate.mockReset();
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'write:billing', 'read:licenses']),
  );
  detail.current = {
    customer: { id: 'customer-1', name: 'Globex' },
    entitlementsRows: [],
    instance: INSTANCE,
    license: { lifecycleState: 'PUBLISHED', name: 'Business', slug: 'business-v2', version: '2' },
  };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleListInstanceInvoices({ body: pageOf([]) }),
    servePlans().handler,
    handleGetUpcomingInvoice({
      body: buildUpcomingInvoice({
        asOf: NOW.toISOString(),
        boundaryAt: '2026-10-27T00:00:00.000Z',
        kind: 'RENEWAL',
        lines: [],
        serviceFrom: '2026-10-27T00:00:00.000Z',
        serviceTo: '2026-11-27T00:00:00.000Z',
        subtotal: 2900,
        total: 2900,
      }),
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

const serve = (value: InstanceBilling) => server.use(handleGetInstanceBilling({ body: value }));
const renderTab = () => renderWithClient(<InstanceDetailBillingTab />);

const TRIAL = () =>
  subscription({ status: 'TRIAL', trialEndsAt: '2026-10-17T00:00:00.000Z', currentPeriodEnd: '2026-10-17T00:00:00.000Z' });
const SCHEDULED_TO_CANCEL = () =>
  subscription({
    cancelAtPeriodEnd: true,
    cancelRequestedAt: '2026-10-05T10:00:00.000Z',
    cancellationReason: 'Moving to another vendor',
  });
const WITH_CHANGE = () =>
  subscription({
    scheduledChange: {
      effectiveAt: '2026-10-27T00:00:00.000Z',
      price: BUSINESS_V3_MONTHLY,
      scheduledAt: '2026-10-01T00:00:00.000Z',
    },
  });

describe('what the tab says of a subscription that just runs', () => {
  it('says nothing above its card, and offers to change the plan, the terms and to cancel', async () => {
    serve(subscription());
    renderTab();

    const actions = await screen.findByTestId('subscription-actions');
    expect(screen.queryByTestId('subscription-notices')).toBeNull();
    expect(within(actions).getByRole('link', { name: 'Change plan' })).toHaveAttribute(
      'href',
      '/customers/instances/$instanceSlug/billing/plan-change',
    );
    expect(within(actions).getByRole('link', { name: 'Payment terms' })).toHaveAttribute(
      'href',
      '/customers/instances/$instanceSlug/billing/terms',
    );
    const cancel = within(actions).getByRole('link', { name: 'Cancel subscription' });
    expect(cancel).toHaveAttribute('href', '/customers/instances/$instanceSlug/billing/cancel');
    expect(cancel).toHaveAttribute('data-params', '{"instanceSlug":"globex-production"}');
  });

  it('names the terms for the provider as well where one is offered, and leads to the same dialog', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stackWithStripe('connected'),
      }),
    );
    serve(subscription());
    renderTab();

    const actions = await screen.findByTestId('subscription-actions');
    expect(
      await within(actions).findByRole('link', { name: 'Provider and terms' }),
    ).toHaveAttribute('href', '/customers/instances/$instanceSlug/billing/terms');
    expect(within(actions).queryByRole('link', { name: 'Payment terms' })).toBeNull();
  });

  it('offers none of it to a session that may only read billing', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    serve(subscription());
    renderTab();

    await screen.findByText('Subscription');
    await waitFor(() => expect(screen.queryByTestId('subscription-actions')).toBeNull());
  });

  it('offers none of it where the release does not ship the lifecycle', async () => {
    server.use(handleGetBillingCapabilities({ body: billingCapabilities() }));
    serve(SCHEDULED_TO_CANCEL());
    renderTab();

    await screen.findByTestId('cancellation-notice');
    expect(screen.queryByTestId('subscription-actions')).toBeNull();
    // The notice still says it, and the way to take it back is not offered either.
    expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull();
  });
});

describe('a trial', () => {
  it('says when it ends, how long is left, that nothing is billed, and when the first invoice is issued', async () => {
    serve(TRIAL());
    renderTab();

    const notice = await screen.findByTestId('trial-notice');
    expect(notice).toHaveTextContent('Trial until Oct 17, 2026 (UTC)');
    expect(notice).toHaveTextContent('10 days left. Nothing is billed during the trial');
    expect(notice).toHaveTextContent('its usage is never billed');
    expect(notice).toHaveTextContent('The first invoice is issued on Oct 17, 2026 (UTC).');
  });

  it('shows the trial on the card where the next boundary would be', async () => {
    serve(TRIAL());
    renderTab();

    const card = (await screen.findByText('Subscription')).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('Trial')).toBeInTheDocument();
    expect(within(card).getByText('Trial ends')).toBeInTheDocument();
    expect(within(card).getByText('First invoice')).toBeInTheDocument();
    expect(within(card).queryByText('Next boundary')).toBeNull();
  });

  it('puts the first invoice a period later for a price billed in arrears', async () => {
    serve({
      ...TRIAL(),
      basePrice: { ...TRIAL().basePrice, billingTiming: 'ARREARS' },
    });
    renderTab();

    expect(await screen.findByTestId('trial-notice')).toHaveTextContent(
      'The first invoice is issued on Nov 17, 2026 (UTC).',
    );
  });

  it('greys the plan change out with its reason, on a button the keyboard still reaches, and leaves the rest', async () => {
    serve(TRIAL());
    renderTab();

    const actions = await screen.findByTestId('subscription-actions');
    const change = within(actions).getByRole('button', { name: 'Change plan' });
    expect(change).toBeDisabled();
    await userEvent.hover(change.parentElement as HTMLElement);
    expect(await screen.findByText('Unavailable during a trial')).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: 'Cancel subscription' })).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: 'Payment terms' })).toBeInTheDocument();
  });
});

describe('a subscription past due', () => {
  const overdue = () =>
    invoiceRow('inv-late', 'Globex', {
      dueAt: '2026-10-02T00:00:00.000Z',
      kind: 'RENEWAL',
      serviceFrom: '2026-09-02T00:00:00.000Z',
      serviceTo: '2026-10-02T00:00:00.000Z',
      status: 'MANUAL',
    });

  it('says since when and for how many days, which invoice is overdue and with a way to it', async () => {
    serve(subscription({ pastDueSince: '2026-10-02T00:00:00.000Z', status: 'PAST_DUE' }));
    server.use(handleListInstanceInvoices({ body: pageOf([overdue()]) }));
    renderTab();

    const notice = await screen.findByTestId('past-due-notice');
    expect(notice).toHaveTextContent('Past due since Oct 2, 2026 (UTC) (5 days)');
    await waitFor(() => expect(notice).toHaveTextContent('The Renewal invoice for'));
    expect(notice).toHaveTextContent('has been unpaid since it fell due on Oct 2, 2026 (UTC).');
    const link = within(notice).getByRole('link', { name: 'View the invoice' });
    expect(link).toHaveAttribute('href', '/invoices/$invoiceId');
    expect(link).toHaveAttribute('data-params', '{"invoiceId":"inv-late"}');
  });

  it('says access is unchanged, and counts down to nothing', async () => {
    serve(subscription({ pastDueSince: '2026-10-02T00:00:00.000Z', status: 'PAST_DUE' }));
    renderTab();

    const notice = await screen.findByTestId('past-due-notice');
    expect(notice).toHaveTextContent(
      'Access is unchanged: Kaiten does not restrict a customer with an unpaid invoice in this version.',
    );
    expect(notice.textContent).not.toMatch(/left|remaining|suspend/i);
  });

  it('says only that an invoice is unpaid when it cannot name it', async () => {
    serve(subscription({ pastDueSince: '2026-10-02T00:00:00.000Z', status: 'PAST_DUE' }));
    renderTab();

    expect(await screen.findByTestId('past-due-notice')).toHaveTextContent(
      'An invoice of this subscription is unpaid past its due date.',
    );
  });

  it('does not invent a date when the subscription says none', async () => {
    serve(subscription({ status: 'PAST_DUE' }));
    renderTab();

    const notice = await screen.findByTestId('past-due-notice');
    expect(notice).toHaveTextContent('Past due');
    expect(notice).not.toHaveTextContent('Past due since');
  });

  it('still offers to change the terms, to cancel, and to change the plan', async () => {
    serve(subscription({ pastDueSince: '2026-10-02T00:00:00.000Z', status: 'PAST_DUE' }));
    renderTab();

    const actions = await screen.findByTestId('subscription-actions');
    expect(within(actions).getByRole('link', { name: 'Change plan' })).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: 'Payment terms' })).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: 'Cancel subscription' })).toBeInTheDocument();
  });
});

describe('a cancellation scheduled for the end of the period', () => {
  it('says when the subscription ends, why, and what is still true', async () => {
    serve(SCHEDULED_TO_CANCEL());
    renderTab();

    const notice = await screen.findByTestId('cancellation-notice');
    expect(notice).toHaveTextContent('Cancels on Oct 27, 2026 (UTC)');
    expect(notice).toHaveTextContent('The period is paid for, so nothing changes until then');
    expect(notice).toHaveTextContent('a final invoice bills what was used in arrears, which may be nothing');
    expect(notice).toHaveTextContent('Reason: Moving to another vendor');
  });

  it('turns the next boundary into the end of the subscription on the card', async () => {
    serve(SCHEDULED_TO_CANCEL());
    renderTab();

    const card = (await screen.findByText('Subscription')).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('Ends on')).toBeInTheDocument();
    expect(within(card).queryByText('Next boundary')).toBeNull();
    expect(within(card).getByText('The subscription ends then, after its final invoice.')).toBeInTheDocument();
  });

  it('greys the plan change out, saying to reactivate first', async () => {
    serve(SCHEDULED_TO_CANCEL());
    renderTab();

    const change = within(await screen.findByTestId('subscription-actions')).getByRole('button', {
      name: 'Change plan',
    });
    expect(change).toBeDisabled();
    await userEvent.hover(change.parentElement as HTMLElement);
    expect(await screen.findByText('Reactivate the subscription first')).toBeInTheDocument();
  });

  it('takes the cancellation back with one click, and the notice goes with it', async () => {
    let reactivated = 0;
    serve(SCHEDULED_TO_CANCEL());
    server.use(
      handleReactivateSubscription(() => {
        reactivated += 1;
        serve(subscription());

        return HttpResponse.json(subscription());
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));

    await waitFor(() => expect(screen.queryByTestId('cancellation-notice')).toBeNull());
    expect(reactivated).toBe(1);
    expect(toast.success).toHaveBeenCalledWith('The cancellation was taken back');
    // The plan can change again.
    expect(
      within(await screen.findByTestId('subscription-actions')).getByRole('link', {
        name: 'Change plan',
      }),
    ).toBeInTheDocument();
  });

  it('sends one request however often it is pressed', async () => {
    let calls = 0;
    serve(SCHEDULED_TO_CANCEL());
    server.use(
      handleReactivateSubscription(async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 150));

        return HttpResponse.json(subscription());
      }),
    );
    renderTab();
    const button = await screen.findByRole('button', { name: 'Reactivate' });

    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  it('does not offer to reactivate to a session that may only read', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    serve(SCHEDULED_TO_CANCEL());
    renderTab();

    await screen.findByTestId('cancellation-notice');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull());
  });

  it('tells in a toast that it was taken back already, and shows the tab as it is now', async () => {
    serve(SCHEDULED_TO_CANCEL());
    server.use(
      handleReactivateSubscription(() => {
        serve(subscription());

        return refusal(409, {
          code: 'ReactivateSubscription.NotScheduledForCancellation',
          detail: 'the subscription is not scheduled for cancellation',
        });
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('the subscription is not scheduled for cancellation'),
    );
    await waitFor(() => expect(screen.queryByTestId('cancellation-notice')).toBeNull());
  });

  it('tells in a toast that it ended meanwhile, with the way to subscribe again, and shows the tab as it is now', async () => {
    serve(SCHEDULED_TO_CANCEL());
    server.use(
      handleReactivateSubscription(() => {
        serve(subscription({ canceledAt: '2026-10-07T00:00:00.000Z', status: 'CANCELED' }));

        return refusal(409, {
          code: 'ReactivateSubscription.Canceled',
          detail: 'the subscription is already canceled',
        });
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('the subscription is already canceled', {
        action: { label: 'Subscribe again', onClick: expect.any(Function) },
      }),
    );
    expect(await screen.findByRole('link', { name: 'Subscribe' })).toBeInTheDocument();
    expect(screen.queryByTestId('cancellation-notice')).toBeNull();
    // The button of the toast leads to the dialog that subscribes.
    toast.error.mock.calls[0][1].action.onClick();
    expect(navigate).toHaveBeenCalledWith({
      params: { instanceSlug: 'globex-production' },
      to: '/customers/instances/$instanceSlug/billing/subscribe',
    });
  });

  it('waits out a period that is being closed, says so in the notice, and sends the request again', async () => {
    let calls = 0;
    serve(SCHEDULED_TO_CANCEL());
    server.use(
      handleReactivateSubscription(() => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            {
              code: 'ReactivateSubscription.BoundaryPending',
              detail: 'the period has ended and is being closed; retry in a minute',
              status: 409,
            },
            { headers: { 'Retry-After': '1' }, status: 409 },
          );
        }
        serve(subscription());

        return HttpResponse.json(subscription());
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));

    expect(await screen.findByTestId('boundary-closing')).toHaveTextContent('Closing the period');
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), { timeout: 4000 });
    expect(calls).toBe(2);
  });

  it('shows any other refusal in the notice, with a way to press the button again', async () => {
    let calls = 0;
    serve(SCHEDULED_TO_CANCEL());
    server.use(
      handleReactivateSubscription(() => {
        calls += 1;

        return calls === 1
          ? refusal(503, { detail: 'the billing service is unavailable' })
          : HttpResponse.json(subscription());
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));

    const notice = await screen.findByTestId('cancellation-notice');
    const alert = await within(notice).findByRole('alert');
    expect(alert).toHaveTextContent('the billing service is unavailable');
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(calls).toBe(2);
  });
});

describe('a plan change waiting for the boundary', () => {
  it('says to which plan, for how much and when, nothing prorated', async () => {
    serve(WITH_CHANGE());
    renderTab();

    const notice = await screen.findByTestId('scheduled-change-notice');
    await waitFor(() =>
      expect(notice).toHaveTextContent(
        'Changes to Business v3 ($149.00/month) on Oct 27, 2026 (UTC)',
      ),
    );
    expect(notice).toHaveTextContent('Nothing is prorated');
  });

  it('names the price alone when no version on sale holds it, and is no less true', async () => {
    serve(WITH_CHANGE());
    server.use(servePlans({ prices: {} }).handler);
    renderTab();

    expect(await screen.findByTestId('scheduled-change-notice')).toHaveTextContent(
      'Changes to Business, monthly ($149.00/month) on Oct 27, 2026 (UTC)',
    );
  });

  it('keeps naming the price when the licenses cannot be read', async () => {
    serve(WITH_CHANGE());
    server.use(
      graphqlOperationHandler({
        GetLicensesWithPrices: () => {
          throw Object.assign(new Error('the licenses cannot be read'), { httpStatus: 502 });
        },
      }),
    );
    renderTab();

    const notice = await screen.findByTestId('scheduled-change-notice');
    expect(notice).toHaveTextContent('Changes to Business, monthly ($149.00/month)');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reads no license to name the plan for a session that may not read licenses', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'write:billing']));
    const plans = servePlans();
    serve(WITH_CHANGE());
    server.use(plans.handler);
    renderTab();

    const notice = await screen.findByTestId('scheduled-change-notice');
    // Long enough for the reads to have answered, were they made.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(notice).toHaveTextContent('Changes to Business, monthly ($149.00/month)');
    expect(plans.requests).toEqual([]);
  });

  it('drops the change with one click, and the notice goes with it', async () => {
    serve(WITH_CHANGE());
    server.use(
      handleCancelPlanChange(() => {
        serve(subscription());

        return HttpResponse.json(subscription());
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel the change' }));

    await waitFor(() => expect(screen.queryByTestId('scheduled-change-notice')).toBeNull());
    expect(toast.success).toHaveBeenCalledWith('The plan change was canceled');
  });

  it('does not offer to drop it to a session that may only read', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    serve(WITH_CHANGE());
    renderTab();

    await screen.findByTestId('scheduled-change-notice');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cancel the change' })).toBeNull(),
    );
  });
});

describe('a subscription that ended', () => {
  const ended = () =>
    subscription({
      canceledAt: '2026-10-06T00:00:00.000Z',
      cancellationReason: 'Contract ended',
      status: 'CANCELED',
    });

  it('has no notice and nothing to do to it: it is subscribed again instead', async () => {
    serve(ended());
    renderTab();

    expect(await screen.findByRole('link', { name: 'Subscribe' })).toBeInTheDocument();
    expect(screen.queryByTestId('subscription-notices')).toBeNull();
    expect(screen.queryByTestId('subscription-actions')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Change plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Cancel subscription' })).toBeNull();
  });

  it('says when and why it ended, and has no upcoming invoice', async () => {
    serve(ended());
    renderTab();

    const card = (await screen.findByText('Subscription')).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('Canceled on')).toBeInTheDocument();
    expect(within(card).getByText('Oct 6, 2026 (UTC)')).toBeInTheDocument();
    expect(within(card).getByText('Contract ended')).toBeInTheDocument();
    expect(screen.queryByText('Upcoming invoice')).toBeNull();
  });

  it('shows no notice of a cancellation that was scheduled before it ended', async () => {
    serve({ ...ended(), cancelAtPeriodEnd: true });
    renderTab();

    await screen.findByRole('link', { name: 'Subscribe' });
    expect(screen.queryByTestId('cancellation-notice')).toBeNull();
  });
});
