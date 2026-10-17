import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { InstanceBilling, PlanChangeTarget } from '@/api-client';
import {
  handleCancelPlanChange,
  handleGetBillingCapabilities,
  handleGetInstanceBilling,
  handleGetUpcomingInvoice,
  handleSchedulePlanChange,
} from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildUpcomingInvoice } from '../../../../../../../../e2e/app/_support/fixtures/build-subscription';
import { billingCapabilitiesProfiles } from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { SchedulePlanChangeDialog } from '../plan-change/schedule-plan-change-dialog';
import {
  BUSINESS_V3_MONTHLY,
  INSTANCE,
  PLAN_LICENSES,
  servePlans,
  subscription,
} from './lifecycle-fixtures';

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../../instance-detail-context', () => ({
  useInstanceDetail: () => detail.current,
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { params?: unknown; to: string }) => (
    <a {...props} data-params={JSON.stringify(params)} href={to}>
      {children}
    </a>
  ),
}));

useBillingTexts();

// The plans are read in one request, and never one read of the prices of each version.
let plans = servePlans();
const priceReads: string[] = [];

beforeEach(() => {
  plans = servePlans();
  priceReads.length = 0;
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'write:billing', 'read:licenses']));
  detail.current = { instance: INSTANCE };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleGetInstanceBilling({ body: subscription() }),
    plans.handler,
    // The REST reads the plans used to be found with: none is expected.
    http.all('*/api/licenses', ({ request }) => {
      priceReads.push(new URL(request.url).pathname);

      return HttpResponse.json({ hasMore: false, items: [] });
    }),
    http.get('*/api/licenses/:licenseSlug/prices', ({ request }) => {
      priceReads.push(new URL(request.url).pathname);

      return HttpResponse.json([]);
    }),
    handleGetUpcomingInvoice({
      body: buildUpcomingInvoice({
        asOf: '2026-10-07T12:00:00.000Z',
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

/** Records the bodies of the plan changes the API is asked to schedule. */
function serveSchedule(answer?: (body: PlanChangeTarget) => Response) {
  const bodies: PlanChangeTarget[] = [];
  server.use(
    handleSchedulePlanChange(async ({ request }) => {
      const body = (await request.json()) as PlanChangeTarget;
      bodies.push(body);

      return answer?.(body) ?? HttpResponse.json(subscription());
    }),
  );

  return bodies;
}

const renderDialog = (onClose = vi.fn()) => {
  renderWithClient(<SchedulePlanChangeDialog onClose={onClose} />);

  return { onClose };
};

const targetField = () => screen.findByRole('combobox', { name: /New plan/ });
const schedule = () => screen.findByRole('button', { name: 'Schedule the change' });

async function choose(name: RegExp | string) {
  await userEvent.click(await targetField());
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('the plan change dialog', () => {
  it('names the instance, the plan it is on and the day the change would take effect, with nothing prorated', async () => {
    renderDialog();

    expect(
      await screen.findByRole('dialog', { name: 'Change the plan of Globex Production' }),
    ).toBeInTheDocument();
    const timeline = await screen.findByTestId('plan-change-timeline');
    expect(timeline).toHaveTextContent('Current plan: Pro, monthly · $29.00/month');
    expect(timeline).toHaveTextContent('The change takes effect on Oct 27, 2026 (UTC)');
    expect(timeline).toHaveTextContent('Nothing is prorated');
  });

  it('shows the upcoming invoice as things stand and says it is not the invoice of the change', async () => {
    renderDialog();

    const upcoming = await screen.findByTestId('plan-change-upcoming');
    expect(upcoming).toHaveTextContent('Without the change, the next invoice would be a renewal invoice of $29.00');
    expect(screen.getByTestId('plan-change-timeline')).toHaveTextContent(
      'Kaiten cannot compose the invoice of a change that is not scheduled yet',
    );
  });

  it('offers the active flat fees of the versions on sale, the plan it is on left out, and nothing metered or in a draft', async () => {
    renderDialog();

    await userEvent.click(await targetField());

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Business v3 · Business, monthly · $149.00/month · In advance',
      'Business v2 · Business, annual · $990.00/year · In arrears',
      'Starter v1 · Starter, monthly · €9.00/month · In advance — Different currency (EUR)',
    ]);
    // One request for every version and its prices, and a version that is not on sale is not offered.
    expect(plans.requests).toEqual([{ limit: 200 }]);
    expect(priceReads).toEqual([]);
  });

  it('shows a plan in another currency and refuses it, saying why', async () => {
    renderDialog();
    await userEvent.click(await targetField());

    const blocked = await screen.findByRole('option', { name: /Starter, monthly/ });

    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(blocked);
    expect(await schedule()).toBeDisabled();
  });

  it('keeps the button off until a plan is chosen, then schedules exactly that price and closes', async () => {
    const bodies = serveSchedule();
    const { onClose } = renderDialog();
    expect(await schedule()).toBeDisabled();

    await choose(/Business v3/);
    await waitFor(async () => expect(await schedule()).toBeEnabled());
    await userEvent.click(await schedule());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ licensePriceId: BUSINESS_V3_MONTHLY.id }]);
    expect(toast.success).toHaveBeenCalledWith('The plan change is scheduled');
  });

  it('sends one request however often it is pressed', async () => {
    let calls = 0;
    server.use(
      handleSchedulePlanChange(async () => {
        calls += 1;
        await delay(150);

        return HttpResponse.json(subscription());
      }),
    );
    const { onClose } = renderDialog();
    await choose(/Business v3/);
    const button = await schedule();
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  describe('when the API refuses', () => {
    it('puts a refusal about the plan on the plan, in the words of the API, and keeps the choice', async () => {
      serveSchedule(() =>
        refusal(409, {
          code: 'SchedulePlanChange.PriceDeprecated',
          detail: 'the price was taken off sale',
        }),
      );
      const { onClose } = renderDialog();
      await choose(/Business v3/);
      await waitFor(async () => expect(await schedule()).toBeEnabled());

      await userEvent.click(await schedule());

      expect(await screen.findByText('the price was taken off sale')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(await targetField()).toHaveTextContent('Business v3');
    });

    it('says above the buttons what is about the subscription and not the plan', async () => {
      serveSchedule(() =>
        refusal(409, {
          code: 'SchedulePlanChange.CancellationScheduled',
          detail: 'a cancellation is scheduled: reactivate first',
        }),
      );
      renderDialog();
      await choose(/Business v3/);
      await waitFor(async () => expect(await schedule()).toBeEnabled());

      await userEvent.click(await schedule());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'a cancellation is scheduled: reactivate first',
      );
    });

    it('waits out a period that is being closed and sends the same request again', async () => {
      let calls = 0;
      const bodies: PlanChangeTarget[] = [];
      server.use(
        handleSchedulePlanChange(async ({ request }) => {
          calls += 1;
          bodies.push((await request.json()) as PlanChangeTarget);

          return calls === 1
            ? HttpResponse.json(
                {
                  code: 'SchedulePlanChange.BoundaryPending',
                  detail: 'the period has ended and is being closed; retry in a minute',
                  status: 409,
                },
                { headers: { 'Retry-After': '1' }, status: 409 },
              )
            : HttpResponse.json(subscription());
        }),
      );
      const { onClose } = renderDialog();
      await choose(/Business v3/);
      await waitFor(async () => expect(await schedule()).toBeEnabled());

      await userEvent.click(await schedule());

      expect(await screen.findByTestId('boundary-closing')).toHaveTextContent('Closing the period');
      await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 4000 });
      expect(bodies).toEqual([
        { licensePriceId: BUSINESS_V3_MONTHLY.id },
        { licensePriceId: BUSINESS_V3_MONTHLY.id },
      ]);
    });
  });

  describe('with a change already scheduled', () => {
    const scheduled = (): InstanceBilling =>
      subscription({
        scheduledChange: {
          effectiveAt: '2026-10-27T00:00:00.000Z',
          price: BUSINESS_V3_MONTHLY,
          scheduledAt: '2026-10-01T00:00:00.000Z',
        },
      });

    beforeEach(() => {
      server.use(handleGetInstanceBilling({ body: scheduled() }));
    });

    it('says to what and when, and that choosing another plan replaces it', async () => {
      renderDialog();

      const summary = await screen.findByTestId('plan-change-scheduled');
      // The version it belongs to is found once the licenses are read.
      await waitFor(() =>
        expect(summary).toHaveTextContent(
          'A change to Business v3 ($149.00/month) is already scheduled for Oct 27, 2026 (UTC).',
        ),
      );
      expect(summary).toHaveTextContent('Choosing another plan replaces it.');
    });

    it('says the next invoice already applies it', async () => {
      renderDialog();

      expect(await screen.findByTestId('plan-change-upcoming')).toHaveTextContent(
        'The next invoice already applies the scheduled change',
      );
    });

    it('drops it, with a toast, and refreshes the subscription', async () => {
      let dropped = 0;
      server.use(
        handleCancelPlanChange(() => {
          dropped += 1;
          server.use(handleGetInstanceBilling({ body: subscription() }));

          return HttpResponse.json(subscription());
        }),
      );
      renderDialog();

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel the change' }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('The plan change was canceled'));
      expect(dropped).toBe(1);
      await waitFor(() => expect(screen.queryByTestId('plan-change-scheduled')).toBeNull());
    });

    it('tells a change that went meanwhile in a toast, with the words of the API', async () => {
      server.use(
        handleCancelPlanChange(() =>
          refusal(409, {
            code: 'CancelPlanChange.NoScheduledChange',
            detail: 'no plan change is scheduled',
          }),
        ),
      );
      renderDialog();

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel the change' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('no plan change is scheduled'));
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('shows any other refusal beside the button, with a way to press it again when nothing was changed', async () => {
      let calls = 0;
      server.use(
        handleCancelPlanChange(() => {
          calls += 1;

          return calls === 1
            ? refusal(503, { detail: 'the billing service is unavailable' })
            : HttpResponse.json(subscription());
        }),
      );
      renderDialog();

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel the change' }));

      const summary = await screen.findByTestId('plan-change-scheduled');
      const alert = await within(summary).findByRole('alert');
      expect(alert).toHaveTextContent('the billing service is unavailable');
      await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('The plan change was canceled'));
      expect(calls).toBe(2);
    });

    it('does not offer to drop it to a session that may not change billing', async () => {
      getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:licenses']));
      renderDialog();

      await screen.findByTestId('plan-change-scheduled');
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Cancel the change' })).toBeNull(),
      );
    });
  });

  describe('when the plan cannot change', () => {
    it.each([
      [
        'a trial',
        { status: 'TRIAL', trialEndsAt: '2026-10-27T00:00:00.000Z' } as const,
        'A plan cannot change during a trial.',
      ],
      [
        'a cancellation scheduled',
        { cancelAtPeriodEnd: true } as const,
        'Reactivate the subscription first to change its plan.',
      ],
      [
        'a subscription that ended',
        { status: 'CANCELED' } as const,
        'This subscription has ended: subscribe the instance again to choose a plan.',
      ],
    ])('says why for %s, with no form', async (_name, overrides, text) => {
      server.use(handleGetInstanceBilling({ body: subscription(overrides) }));
      renderDialog();

      expect(await screen.findByTestId('plan-change-unavailable')).toHaveTextContent(text);
      expect(screen.queryByRole('button', { name: 'Schedule the change' })).toBeNull();
      // Nothing is read to fill a form that is not shown.
      expect(plans.requests).toEqual([]);
    });

    it('says an instance nobody bills has no plan to change', async () => {
      server.use(
        handleGetInstanceBilling(() =>
          refusal(404, { code: 'GetInstanceBilling.NotFound', detail: 'No subscription' }),
        ),
      );
      renderDialog();

      expect(await screen.findByTestId('plan-change-unavailable')).toHaveTextContent(
        'This instance has no subscription.',
      );
    });
  });

  describe('when the plans cannot be found', () => {
    it('says no other plan can be reached when every other version is out of reach', async () => {
      server.use(
        servePlans({
          licenses: [PLAN_LICENSES[0]],
          prices: { 'business-v2': [subscription().basePrice] },
        }).handler,
      );
      renderDialog();

      expect(await screen.findByTestId('no-plan')).toHaveTextContent(
        'No other plan can be reached',
      );
      expect(screen.queryByRole('combobox', { name: /New plan/ })).toBeNull();
    });

    it('shows the refusal of the read of the plans, with a way to ask again', async () => {
      // A problem document, as the API refuses a document with: its words are shown.
      server.use(
        http.post('*/api/graphql', () =>
          refusal(500, { detail: 'the plans cannot be read' }),
        ),
      );
      renderDialog();

      expect(await screen.findByRole('alert')).toHaveTextContent('the plans cannot be read');
      server.use(servePlans().handler);
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      await userEvent.click(await targetField());
      expect(await screen.findByRole('option', { name: /Business v3/ })).toBeInTheDocument();
    });

    it('names the scope a session lacks to read the plans, and offers a way to ask again', async () => {
      getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'write:billing']));
      renderDialog();

      expect(await screen.findByRole('alert')).toHaveTextContent('read:licenses');
      expect(plans.requests).toEqual([]);
    });

    it('shows the refusal to read the subscription, with a way to ask again', async () => {
      let calls = 0;
      server.use(
        handleGetInstanceBilling(() => {
          calls += 1;

          return calls === 1
            ? refusal(500, { detail: 'the billing service is down' })
            : HttpResponse.json(subscription());
        }),
      );
      renderDialog();

      expect(await screen.findByRole('alert')).toHaveTextContent('the billing service is down');
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await targetField()).toBeInTheDocument();
    });
  });
});
