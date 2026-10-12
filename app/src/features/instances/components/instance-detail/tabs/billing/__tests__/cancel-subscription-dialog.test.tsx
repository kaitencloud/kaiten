import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type {
  CanceledSubscription,
  InstanceBilling,
  SubscriptionCancellation,
} from '@/api-client';
import {
  handleCancelSubscription,
  handleDetachInstanceAddon,
  handleGetBillingCapabilities,
  handleGetInstanceBilling,
  handleListInstanceAddons,
  handleUpdateInstance,
} from '@/api-client/msw.gen';
import {
  invoiceRow,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { CancelSubscriptionDialog } from '../cancel/cancel-subscription-dialog';
import { addon, BUSINESS_V3_MONTHLY, INSTANCE, subscription } from './lifecycle-fixtures';

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
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

const SCOPES = [
  'read:billing',
  'write:billing',
  'read:instances',
  'write:instances',
] as const;

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken([...SCOPES]));
  detail.current = { instance: INSTANCE };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleGetInstanceBilling({ body: subscription() }),
    handleListInstanceAddons({ body: [] }),
  );
});

const canceled = (
  overrides: Partial<CanceledSubscription> = {},
): CanceledSubscription => ({ ...subscription(), ...overrides }) as CanceledSubscription;

/** Records the bodies of the cancellations the API is asked for. */
function serveCancel(answer?: (body: SubscriptionCancellation) => Response) {
  const bodies: SubscriptionCancellation[] = [];
  server.use(
    handleCancelSubscription(async ({ request }) => {
      const body = (await request.json()) as SubscriptionCancellation;
      bodies.push(body);

      return answer?.(body) ?? HttpResponse.json(canceled({ cancelAtPeriodEnd: true }));
    }),
  );

  return bodies;
}

const renderDialog = (onClose = vi.fn()) => {
  renderWithClient(<CancelSubscriptionDialog onClose={onClose} />);

  return { onClose };
};

const confirm = () => screen.findByRole('button', { name: 'Cancel subscription' });
const modeField = () => screen.findByRole('combobox', { name: /When/ });

async function chooseImmediately() {
  await userEvent.click(await modeField());
  await userEvent.click(await screen.findByRole('option', { name: 'Immediately' }));
}

describe('the cancel dialog', () => {
  it('names the instance and waits for the end of the period, saying what that does and what is billed', async () => {
    renderDialog();

    expect(
      await screen.findByRole('dialog', { name: 'Cancel the subscription of Globex Production' }),
    ).toBeInTheDocument();
    expect(await modeField()).toHaveTextContent('At the end of the period: Oct 27, 2026 (UTC)');
    const explanation = screen.getByTestId('cancel-explanation');
    expect(explanation).toHaveTextContent('The subscription ends on Oct 27, 2026');
    expect(explanation).toHaveTextContent('access and entitlements do not change until Oct 27, 2026');
    expect(explanation).toHaveTextContent('a final invoice bills what was used in arrears, which may be nothing');
    expect(explanation).toHaveTextContent('You can reactivate the subscription');
  });

  describe('with a plan change scheduled', () => {
    beforeEach(() => {
      server.use(
        handleGetInstanceBilling({
          body: subscription({
            scheduledChange: {
              effectiveAt: '2026-10-27T00:00:00.000Z',
              price: BUSINESS_V3_MONTHLY,
              scheduledAt: '2026-10-01T00:00:00.000Z',
            },
          }),
        }),
      );
    });

    it('says the cancellation drops the change, whichever way it ends', async () => {
      renderDialog();

      await modeField();
      const dropped = 'The plan change scheduled for Oct 27, 2026 (UTC) is dropped by this cancellation.';
      expect(screen.getByTestId('cancel-explanation')).toHaveTextContent(dropped);

      await chooseImmediately();

      expect(screen.getByTestId('cancel-explanation')).toHaveTextContent(dropped);
    });
  });

  it('says nothing of a plan change when none is scheduled', async () => {
    renderDialog();

    await modeField();
    expect(screen.getByTestId('cancel-explanation')).not.toHaveTextContent('plan change');
  });

  it('cancels at the end of the period with no reason, and says it is scheduled', async () => {
    const bodies = serveCancel();
    renderDialog();

    await userEvent.click(await confirm());

    const done = await screen.findByTestId('canceled');
    expect(done).toHaveTextContent('Cancellation scheduled');
    expect(done).toHaveTextContent('The subscription ends on Oct 27, 2026');
    expect(bodies).toEqual([{ mode: 'AT_PERIOD_END' }]);
    // Nothing about a final invoice for a cancellation that has not happened yet.
    expect(within(done).queryByText(/Final invoice/)).toBeNull();
    // The form is gone: nothing can be sent twice from here.
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).toBeNull();
  });

  it('keeps the dialog open until it is closed, and closes to the tab', async () => {
    serveCancel();
    const { onClose } = renderDialog();
    await userEvent.click(await confirm());
    await screen.findByTestId('canceled');

    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement);

    expect(onClose).toHaveBeenCalled();
  });

  it('trims the reason it sends, and keeps nothing of one made of spaces', async () => {
    const bodies = serveCancel();
    renderDialog();
    const reason = await screen.findByLabelText('Reason');

    await userEvent.type(reason, '  switched to another tool ');
    await userEvent.click(await confirm());
    await screen.findByTestId('canceled');

    expect(bodies).toEqual([{ mode: 'AT_PERIOD_END', reason: 'switched to another tool' }]);
  });

  describe('immediately', () => {
    it('says it cannot be undone, that nothing is prorated or refunded, and turns the button destructive', async () => {
      renderDialog();
      const normal = await confirm();
      expect(normal).not.toHaveClass('bg-destructive');

      await chooseImmediately();

      const explanation = screen.getByTestId('cancel-explanation');
      expect(explanation).toHaveTextContent('The subscription ends now');
      expect(explanation).toHaveTextContent('No proration');
      expect(explanation).toHaveTextContent('is not refunded');
      expect(explanation).toHaveTextContent('This cannot be undone');
      await waitFor(async () => expect(await confirm()).toHaveClass('bg-destructive'));
    });

    it('ends it now, and links the final invoice with what it comes to', async () => {
      const bodies = serveCancel(() =>
        HttpResponse.json(
          canceled({
            canceledAt: '2026-10-07T12:00:00.000Z',
            finalInvoice: invoiceRow('inv-final', 'Globex', {
              kind: 'FINAL',
              total: 4200,
            }),
            status: 'CANCELED',
          }),
        ),
      );
      renderDialog();
      await chooseImmediately();
      await userEvent.type(await screen.findByLabelText('Reason'), 'Contract ended');

      await userEvent.click(await confirm());

      const done = await screen.findByTestId('canceled');
      expect(bodies).toEqual([{ mode: 'IMMEDIATE', reason: 'Contract ended' }]);
      expect(done).toHaveTextContent('Subscription canceled');
      expect(done).toHaveTextContent('Final invoice: $42.00');
      const link = within(done).getByRole('link', { name: 'View the invoice' });
      expect(link).toHaveAttribute('href', '/invoices/$invoiceId');
      expect(link).toHaveAttribute('data-params', '{"invoiceId":"inv-final"}');
    });

    it('says so when the API issued no final invoice', async () => {
      serveCancel(() => HttpResponse.json(canceled({ status: 'CANCELED' })));
      renderDialog();
      await chooseImmediately();

      await userEvent.click(await confirm());

      expect(await screen.findByTestId('canceled')).toHaveTextContent(
        'The API returned no final invoice.',
      );
    });
  });

  describe('a trial', () => {
    beforeEach(() => {
      server.use(
        handleGetInstanceBilling({
          body: subscription({ status: 'TRIAL', trialEndsAt: '2026-10-27T00:00:00.000Z' }),
        }),
      );
    });

    it('has no choice of when: it ends at once, and nothing is billed', async () => {
      renderDialog();

      expect(await screen.findByRole('button', { name: 'End the trial' })).toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /When/ })).toBeNull();
      const explanation = screen.getByTestId('cancel-explanation');
      expect(explanation).toHaveTextContent('The trial ends now');
      expect(explanation).toHaveTextContent('Nothing is billed: no invoice is issued');
      expect(screen.getByRole('button', { name: 'Keep the trial' })).toBeInTheDocument();
    });

    it('asks for an immediate cancellation, which is what it is', async () => {
      const bodies = serveCancel(() => HttpResponse.json(canceled({ status: 'CANCELED' })));
      renderDialog();

      await userEvent.click(await screen.findByRole('button', { name: 'End the trial' }));

      const done = await screen.findByTestId('canceled');
      expect(bodies).toEqual([{ mode: 'IMMEDIATE' }]);
      expect(done).toHaveTextContent('Trial ended');
      expect(done).toHaveTextContent('Nothing was billed');
    });
  });

  describe('the reason', () => {
    it('counts the characters the API counts, and lets 500 through', async () => {
      renderDialog();
      const reason = await screen.findByLabelText('Reason');

      expect(screen.getByText('0/500 characters')).toBeInTheDocument();
      fireEvent.change(reason, { target: { value: 'é'.repeat(500) } });

      expect(await screen.findByText('500/500 characters')).toBeInTheDocument();
      expect(await confirm()).toBeEnabled();
    });

    it('refuses 501 before the API does, in words, and keeps the button off', async () => {
      const bodies = serveCancel();
      renderDialog();
      const reason = await screen.findByLabelText('Reason');

      fireEvent.change(reason, { target: { value: 'a'.repeat(501) } });
      fireEvent.blur(reason);

      // The refusal takes the place of the description, as it does for every field, and the
      // counter stays: the person has to see by how much the reason is too long.
      expect(await screen.findByText('The reason is at most 500 characters')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-reason-counter')).toHaveTextContent('501/500 characters');
      await waitFor(async () => expect(await confirm()).toBeDisabled());
      expect(bodies).toEqual([]);
    });

    it('counts an emoji as one character, since the API does', async () => {
      renderDialog();
      const reason = await screen.findByLabelText('Reason');

      fireEvent.change(reason, { target: { value: '\u{1F600}'.repeat(500) } });

      expect(await screen.findByText('500/500 characters')).toBeInTheDocument();
      expect(await confirm()).toBeEnabled();
    });
  });

  describe('beside the cancellation', () => {
    beforeEach(() => {
      server.use(handleListInstanceAddons({ body: [addon('extra-seats-v1', 5), addon('connector-v2')] }));
    });

    it('offers to remove the add-ons and to set the end of the license, both unchecked, each on its own', async () => {
      renderDialog();

      const removeAddons = await screen.findByRole('checkbox', { name: 'Also remove the add-ons' });
      const setEndDate = screen.getByRole('checkbox', { name: 'Also set the license end date' });
      expect(removeAddons).not.toBeChecked();
      expect(setEndDate).not.toBeChecked();
      await waitFor(() => expect(removeAddons).toBeEnabled());
      expect(screen.getByText(/extra-seats-v1 × 5, connector-v2 × 1/)).toBeInTheDocument();
      expect(screen.getByText(/The license of this instance ends on Dec 31, 2027/)).toBeInTheDocument();
      // The date is asked only once it is wanted.
      expect(screen.queryByLabelText('License ends (UTC)')).toBeNull();
    });

    it('does nothing about either when neither is checked', async () => {
      const detached = vi.fn();
      const updated = vi.fn();
      server.use(
        handleDetachInstanceAddon(() => {
          detached();

          return new HttpResponse(null, { status: 204 });
        }),
        handleUpdateInstance(() => {
          updated();

          return HttpResponse.json(INSTANCE);
        }),
      );
      serveCancel();
      renderDialog();

      await userEvent.click(await confirm());
      await screen.findByTestId('canceled');

      expect(detached).not.toHaveBeenCalled();
      expect(updated).not.toHaveBeenCalled();
      expect(screen.queryByTestId('cancel-follow-ups')).toBeNull();
    });

    it('removes the add-ons and sets the end of the license once the cancellation is accepted, and says each was done', async () => {
      const order: string[] = [];
      let updateBody: Record<string, unknown> | undefined;
      server.use(
        handleDetachInstanceAddon(({ params }) => {
          order.push(`detach ${String(params.addonSlug)}`);

          return new HttpResponse(null, { status: 204 });
        }),
        handleUpdateInstance(async ({ request }) => {
          order.push('update');
          updateBody = (await request.json()) as Record<string, unknown>;

          return HttpResponse.json(INSTANCE);
        }),
      );
      serveCancel((body) => {
        order.push(`cancel ${body.mode}`);

        return HttpResponse.json(canceled({ cancelAtPeriodEnd: true }));
      });
      renderDialog();
      const removeAddons = await screen.findByRole('checkbox', { name: 'Also remove the add-ons' });
      await waitFor(() => expect(removeAddons).toBeEnabled());

      await userEvent.click(removeAddons);
      await userEvent.click(screen.getByRole('checkbox', { name: 'Also set the license end date' }));
      const date = await screen.findByLabelText('License ends (UTC)');
      // Proposed as the end of the period, since the cancellation waits for it.
      expect(date).toHaveValue('2026-10-27T00:00');
      await userEvent.click(await confirm());

      const report = await screen.findByTestId('cancel-follow-ups');
      expect(order).toEqual([
        'cancel AT_PERIOD_END',
        'detach extra-seats-v1',
        'detach connector-v2',
        'update',
      ]);
      expect(report).toHaveTextContent('Add-ons removed: extra-seats-v1, connector-v2.');
      expect(report).toHaveTextContent('The license now ends on Oct 27, 2026 (UTC).');
      // The PUT replaces the instance: all of it goes back, with the one date changed.
      expect(updateBody).toEqual({
        customerId: 'customer-1',
        deploymentZoneId: 'zone-1',
        description: 'The production instance of Globex',
        endLicenseDate: '2026-10-27T00:00:00.000Z',
        licenseId: 'license-business-2',
        metadata: { region: 'eu' },
        name: 'Globex Production',
        startLicenseDate: '2026-01-01T00:00:00.000Z',
      });
    });

    it('says which could not be done, keeps the cancellation, and tries only those again', async () => {
      const detached: string[] = [];
      let locked = true;
      server.use(
        handleDetachInstanceAddon(({ params }) => {
          detached.push(String(params.addonSlug));

          return params.addonSlug === 'connector-v2' && locked
            ? refusal(409, { code: 'DetachInstanceAddon.Locked', detail: 'the subscription is being closed' })
            : new HttpResponse(null, { status: 204 });
        }),
        handleUpdateInstance(() =>
          refusal(403, { code: 'Auth.MissingScope', detail: 'missing required scope: write:instances' }),
        ),
      );
      serveCancel();
      renderDialog();
      const removeAddons = await screen.findByRole('checkbox', { name: 'Also remove the add-ons' });
      await waitFor(() => expect(removeAddons).toBeEnabled());
      await userEvent.click(removeAddons);
      await userEvent.click(screen.getByRole('checkbox', { name: 'Also set the license end date' }));
      await userEvent.click(await confirm());

      const report = await screen.findByTestId('cancel-follow-ups');
      expect(screen.getByTestId('canceled')).toHaveTextContent('Cancellation scheduled');
      expect(report).toHaveTextContent('Add-ons removed: extra-seats-v1.');
      expect(report).toHaveTextContent('connector-v2 could not be removed. the subscription is being closed');
      expect(report).toHaveTextContent('The end of the license could not be set.');

      server.use(handleUpdateInstance(() => HttpResponse.json(INSTANCE)));
      locked = false;
      detached.length = 0;
      await userEvent.click(within(report).getByRole('button', { name: 'Try again' }));

      await waitFor(() =>
        expect(report).toHaveTextContent('Add-ons removed: extra-seats-v1, connector-v2.'),
      );
      // Only what failed is sent again: the add-on that went is not detached twice.
      expect(detached).toEqual(['connector-v2']);
      expect(report).toHaveTextContent('The license now ends on Oct 27, 2026 (UTC).');
      expect(within(report).queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('offers nothing beside the cancellation to a session that may read the instance but not change it', async () => {
      getAuthToken.mockResolvedValue(
        sessionToken(['read:billing', 'write:billing', 'read:instances']),
      );
      renderDialog();

      await confirm();
      await waitFor(() => expect(screen.queryByText('Beside the cancellation')).toBeNull());
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('offers nothing beside the cancellation to a session that may only cancel', async () => {
      getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'write:billing']));
      renderDialog();

      await confirm();
      await waitFor(() => expect(screen.queryByText('Beside the cancellation')).toBeNull());
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('says an instance with no add-on has none to remove, and says when it could not read them', async () => {
      server.use(handleListInstanceAddons({ body: [] }));
      const { unmount } = renderWithClient(<CancelSubscriptionDialog onClose={vi.fn()} />);

      expect(await screen.findByText('This instance holds no add-on.')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Also remove the add-ons' })).toBeDisabled();
      unmount();

      server.use(handleListInstanceAddons(() => refusal(500, { detail: 'boom' })));
      renderWithClient(<CancelSubscriptionDialog onClose={vi.fn()} />);

      expect(
        await screen.findByText('The add-ons of this instance could not be read.'),
      ).toBeInTheDocument();
    });
  });

  describe('when the API refuses', () => {
    it('says why above the buttons, keeps what was typed, and can be sent again', async () => {
      let attempts = 0;
      server.use(
        handleCancelSubscription(() => {
          attempts += 1;

          return attempts === 1
            ? refusal(500, { detail: 'the billing service is down' })
            : HttpResponse.json(canceled({ cancelAtPeriodEnd: true }));
        }),
      );
      renderDialog();
      await userEvent.type(await screen.findByLabelText('Reason'), 'budget');

      await userEvent.click(await confirm());

      expect(await screen.findByRole('alert')).toHaveTextContent('the billing service is down');
      expect(screen.getByLabelText('Reason')).toHaveValue('budget');
      expect(screen.queryByTestId('canceled')).toBeNull();

      await userEvent.click(await confirm());
      expect(await screen.findByTestId('canceled')).toBeInTheDocument();
    });

    it('puts the refusal of a reason on the reason, in the words of the API', async () => {
      serveCancel(() =>
        refusal(422, {
          code: 'CancelSubscription.InvalidReason',
          detail: 'reason is at most 500 characters',
        }),
      );
      renderDialog();

      await userEvent.click(await confirm());

      expect(await screen.findByText('reason is at most 500 characters')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('tells a subscription that was canceled meanwhile, and does not pretend it worked', async () => {
      serveCancel(() =>
        refusal(409, {
          code: 'CancelSubscription.NotActive',
          detail: 'the subscription is already canceled',
        }),
      );
      renderDialog();

      await userEvent.click(await confirm());

      expect(await screen.findByRole('alert')).toHaveTextContent('the subscription is already canceled');
      expect(screen.queryByTestId('canceled')).toBeNull();
    });

    it('sends one request however often it is pressed', async () => {
      let calls = 0;
      server.use(
        handleCancelSubscription(async () => {
          calls += 1;
          await delay(150);

          return HttpResponse.json(canceled({ cancelAtPeriodEnd: true }));
        }),
      );
      renderDialog();
      const button = await confirm();

      await userEvent.click(button);
      await userEvent.click(button);
      await userEvent.click(button);

      expect(await screen.findByTestId('canceled')).toBeInTheDocument();
      expect(calls).toBe(1);
    });
  });

  describe('while the period is being closed', () => {
    const closing = (retryAfter: string) =>
      HttpResponse.json(
        {
          code: 'CancelSubscription.BoundaryPending',
          detail: 'the period has ended and is being closed; retry in a minute',
          status: 409,
        },
        { headers: { 'Retry-After': retryAfter }, status: 409 },
      );

    it('says so instead of showing an error, then sends the very same request again by itself', async () => {
      let calls = 0;
      const bodies: SubscriptionCancellation[] = [];
      server.use(
        handleCancelSubscription(async ({ request }) => {
          calls += 1;
          bodies.push((await request.json()) as SubscriptionCancellation);

          return calls === 1 ? closing('1') : HttpResponse.json(canceled({ cancelAtPeriodEnd: true }));
        }),
      );
      renderDialog();
      await userEvent.type(await screen.findByLabelText('Reason'), 'budget');

      await userEvent.click(await confirm());

      const notice = await screen.findByTestId('boundary-closing');
      expect(notice).toHaveTextContent('Closing the period');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(await screen.findByTestId('canceled', undefined, { timeout: 4000 })).toBeInTheDocument();
      expect(calls).toBe(2);
      expect(bodies[1]).toEqual(bodies[0]);
      expect(screen.queryByTestId('boundary-closing')).toBeNull();
    });

    it('shows what the API said and a way to try again when the second try is refused as well', async () => {
      let calls = 0;
      server.use(
        handleCancelSubscription(() => {
          calls += 1;

          return calls <= 2 ? closing('1') : HttpResponse.json(canceled({ cancelAtPeriodEnd: true }));
        }),
      );
      renderDialog();

      await userEvent.click(await confirm());

      const alert = await screen.findByRole('alert', undefined, { timeout: 4000 });
      expect(alert).toHaveTextContent('the period has ended and is being closed');
      expect(calls).toBe(2);
      expect(screen.queryByTestId('boundary-closing')).toBeNull();

      await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

      expect(await screen.findByTestId('canceled', undefined, { timeout: 4000 })).toBeInTheDocument();
      expect(calls).toBe(3);
    });
  });

  describe('when there is nothing to cancel', () => {
    it('says a subscription that ended is already canceled, with no form', async () => {
      server.use(handleGetInstanceBilling({ body: subscription({ status: 'CANCELED' }) }));
      renderDialog();

      expect(await screen.findByTestId('cancel-unavailable')).toHaveTextContent(
        'This subscription is already canceled.',
      );
      expect(screen.queryByRole('button', { name: 'Cancel subscription' })).toBeNull();
    });

    it('says an instance nobody bills has nothing to cancel', async () => {
      server.use(
        handleGetInstanceBilling(() =>
          refusal(404, { code: 'GetInstanceBilling.NotFound', detail: 'No subscription' }),
        ),
      );
      renderDialog();

      expect(await screen.findByTestId('cancel-unavailable')).toHaveTextContent(
        'This instance has no subscription to cancel.',
      );
    });

    it('shows a refusal to read the subscription, with a way to ask again', async () => {
      let calls = 0;
      server.use(
        handleGetInstanceBilling(() => {
          calls += 1;

          return calls === 1
            ? refusal(500, { detail: 'the billing service is down' })
            : HttpResponse.json(subscription() as InstanceBilling);
        }),
      );
      renderDialog();

      expect(await screen.findByRole('alert')).toHaveTextContent('the billing service is down');
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await confirm()).toBeInTheDocument();
    });

    it('keeps the form of a subscription that is canceled by this very dialog, until it has said what it did', async () => {
      serveCancel(() => HttpResponse.json(canceled({ status: 'CANCELED' })));
      server.use(handleGetInstanceBilling({ body: subscription() }));
      renderDialog();
      await userEvent.click(await confirm());

      // The tab behind refetches the canceled subscription; the dialog says what it did.
      server.use(handleGetInstanceBilling({ body: subscription({ status: 'CANCELED' }) }));
      expect(await screen.findByTestId('canceled')).toBeInTheDocument();
      expect(screen.queryByTestId('cancel-unavailable')).toBeNull();
    });
  });
});
