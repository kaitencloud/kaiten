import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { CustomerBilling, PaymentMethodLabels } from '@/api-client';
import {
  handleCompletePaymentMethodSession,
  handleCreatePaymentMethodSession,
  handleCreatePortalSession,
  handleDetachPaymentMethod,
  handleGetBillingCapabilities,
  handleGetCustomerBilling,
} from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  billingCapabilitiesProfiles,
  type StripeStanding,
} from '../../../../../e2e/app/_support/model/billing-capabilities';
import { PaymentMethodCard } from '../customer-detail/payment-method/payment-method-card';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const leave = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
// The browser is the edge of a hosted page: where the page sent it is what is asserted.
vi.mock('../../utils/provider-pages', () => ({
  getCustomerReturnUrl: (slug: string) => `https://console.test/customers/${slug}`,
  leaveToProvider: leave,
}));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

const VISA: PaymentMethodLabels = {
  attachedAt: '2026-08-01T00:00:00.000Z',
  brand: 'visa',
  expMonth: 12,
  expYear: 2099,
  last4: '4242',
  status: 'ACTIVE',
};

beforeEach(() => {
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'write:billing']),
  );
  toast.error.mockReset();
  toast.success.mockReset();
  leave.mockReset();
  stripeIs('connected');
  serveBilling(VISA);
});

function stripeIs(standing: StripeStanding) {
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithStripe(standing),
    }),
  );
}

/** What the API holds of the customer in Stripe, read again after every write. */
function serveBilling(
  paymentMethod: PaymentMethodLabels | null,
  extra: Partial<CustomerBilling['providers'][number]> = {},
) {
  const state = { paymentMethod };
  const reads = { count: 0 };
  server.use(
    handleGetCustomerBilling(() => {
      reads.count += 1;

      return HttpResponse.json({
        billingEmail: 'ap@acme.test',
        providers: [
          {
            externalCustomerId: 'cus_acme',
            paymentMethod: state.paymentMethod,
            providerKind: 'STRIPE',
            ...extra,
          },
        ],
      });
    }),
  );

  return { reads, state };
}

const renderCard = (
  props: Partial<Parameters<typeof PaymentMethodCard>[0]> = {},
) => {
  const onSetupHandled = vi.fn();
  renderWithClient(
    <PaymentMethodCard
      customerSlug="acme"
      onSetupHandled={onSetupHandled}
      {...props}
    />,
  );

  return { onSetupHandled };
};

const method = () => screen.findByTestId('payment-method');

describe('the payment method of a customer', () => {
  it('shows the card Stripe holds as labels: the brand, the last four digits and the expiry', async () => {
    renderCard();

    const card = await method();
    expect(card).toHaveAttribute('data-standing', 'active');
    expect(card).toHaveTextContent('Visa ending in 4242');
    expect(card).toHaveTextContent('Expires 12/2099');
    expect(card).toHaveTextContent('Active');
    expect(within(card).queryByText('Expires soon')).toBeNull();
  });

  it('says the card is soon to expire in its last thirty days', async () => {
    const next = new Date();
    next.setUTCDate(1);
    serveBilling({ ...VISA, expMonth: next.getUTCMonth() + 1, expYear: next.getUTCFullYear() });
    renderCard();

    expect(await screen.findByText('Expires soon')).toBeInTheDocument();
  });

  it.each([
    ['EXPIRED', 'Expired', 'This card has expired'],
    ['FAILED', 'Last charge failed', 'A charge said this card can no longer be used'],
  ] as const)(
    'says a %s card cannot be charged, and to save another',
    async (status, badge, words) => {
      serveBilling({ ...VISA, status });
      renderCard();

      const card = await method();
      expect(card).toHaveAttribute('data-standing', status.toLowerCase());
      expect(card).toHaveTextContent(badge);
      expect(card).toHaveTextContent(words);
    },
  );

  it('says there is none for a customer without a payment method, and what that means', async () => {
    serveBilling(null);
    renderCard();

    const card = await method();
    expect(card).toHaveAttribute('data-standing', 'none');
    expect(card).toHaveTextContent('No payment method on file');
    expect(card).toHaveTextContent('A contract that sends the invoice needs none.');
    expect(screen.getByRole('button', { name: 'Add a payment method' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
  });

  it('says there is none for a customer that has never been to Stripe, and offers no portal', async () => {
    server.use(
      handleGetCustomerBilling({ body: { providers: [] } }),
    );
    renderCard();

    expect(await method()).toHaveAttribute('data-standing', 'none');
    expect(screen.getByRole('button', { name: 'Add a payment method' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage in Stripe' })).toBeNull();
  });

  it('offers to replace, to manage it in Stripe and to remove it where there is one', async () => {
    renderCard();

    await method();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Manage in Stripe' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  it('links to the customer in the dashboard of Stripe, when the address is https', async () => {
    serveBilling(VISA, { webUrl: 'https://dashboard.stripe.com/test/customers/cus_acme' });
    renderCard();

    expect(
      await screen.findByRole('link', { name: /Open the customer in Stripe/ }),
    ).toHaveAttribute('href', 'https://dashboard.stripe.com/test/customers/cus_acme');
  });

  it('draws no link to an address that is not https', async () => {
    serveBilling(VISA, { webUrl: 'javascript:alert(1)' });
    renderCard();

    await method();
    expect(screen.queryByRole('link', { name: /Open the customer in Stripe/ })).toBeNull();
  });

  it('shows it to a session that may only read, with no button', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    renderCard();

    await method();
    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it.each(['available', 'vaultMissing', 'notEntitled'] as const)(
    'is not there while Stripe is %s: there is no payment method to hold',
    async (standing) => {
      stripeIs(standing);
      renderCard();

      await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
      expect(screen.queryByTestId('payment-method-card')).toBeNull();
    },
  );

  it('is not there for a session that may not read what a customer holds in Stripe', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    renderCard();

    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    expect(screen.queryByTestId('payment-method-card')).toBeNull();
  });

  it('shows a refusal to read it, with a way to ask again', async () => {
    let reads = 0;
    server.use(
      handleGetCustomerBilling(() => {
        reads += 1;

        return reads === 1
          ? refusal(503, { detail: 'Stripe is unreachable' })
          : HttpResponse.json({ providers: [] });
      }),
    );
    renderCard();

    const problem = await screen.findByTestId('payment-method-error');
    expect(problem).toHaveTextContent('Stripe is unreachable');
    await userEvent.click(within(problem).getByRole('button', { name: 'Retry' }));

    expect(await method()).toHaveAttribute('data-standing', 'none');
  });
});

describe('saving a payment method', () => {
  it('asks the API for the page Stripe hosts, coming back to the customer, and sends the browser there', async () => {
    const bodies: unknown[] = [];
    server.use(
      handleCreatePaymentMethodSession(async ({ params, request }) => {
        bodies.push({ body: await request.json(), customerSlug: params.customerSlug });

        return HttpResponse.json({
          expiresAt: '2027-03-10T13:00:00.000Z',
          sessionId: 'cs_1',
          url: 'https://checkout.stripe.test/c/setup/cs_1',
        });
      }),
    );
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));

    await waitFor(() =>
      expect(leave).toHaveBeenCalledWith('https://checkout.stripe.test/c/setup/cs_1'),
    );
    expect(bodies).toEqual([
      {
        body: { returnUrl: 'https://console.test/customers/acme' },
        customerSlug: 'acme',
      },
    ]);
  });

  it('asks which currency when the customer has no live subscription to take it from, then goes on with it', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      handleCreatePaymentMethodSession(async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);

        return body.currency
          ? HttpResponse.json({
              expiresAt: '2027-03-10T13:00:00.000Z',
              sessionId: 'cs_2',
              url: 'https://checkout.stripe.test/c/setup/cs_2',
            })
          : refusal(422, {
              code: 'CreatePaymentMethodSession.CurrencyRequired',
              detail: 'the customer has no live subscription: say which currency the payment method is set up in',
            });
      }),
    );
    serveBilling(null);
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Add a payment method' }));

    const dialog = await screen.findByRole('dialog', { name: 'Currency of the payment method' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Pick a currency' }));
    await userEvent.click(await screen.findByRole('option', { name: 'EUR' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue to Stripe' }));

    await waitFor(() =>
      expect(leave).toHaveBeenCalledWith('https://checkout.stripe.test/c/setup/cs_2'),
    );
    expect(bodies).toEqual([
      { returnUrl: 'https://console.test/customers/acme' },
      { currency: 'EUR', returnUrl: 'https://console.test/customers/acme' },
    ]);
  });

  it('asks again from the card when Stripe could not be reached, and sends the browser to the page it gives', async () => {
    let asked = 0;
    server.use(
      handleCreatePaymentMethodSession(() => {
        asked += 1;

        return asked === 1
          ? refusal(503, {
              code: 'CreatePaymentMethodSession.ProviderUnavailable',
              detail: 'the payment provider could not be reached',
            })
          : HttpResponse.json({
              expiresAt: '2027-03-10T13:00:00.000Z',
              sessionId: 'cs_4',
              url: 'https://checkout.stripe.test/c/setup/cs_4',
            });
      }),
    );
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    const refused = await screen.findByRole('alert');
    expect(refused).toHaveTextContent('Nothing was changed.');
    expect(leave).not.toHaveBeenCalled();
    await userEvent.click(within(refused).getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(leave).toHaveBeenCalledWith('https://checkout.stripe.test/c/setup/cs_4'),
    );
    expect(asked).toBe(2);
  });

  it('asks again, in the same currency, when a Stripe that could not be reached refused, and says nothing was changed', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      handleCreatePaymentMethodSession(async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        if (!body.currency) {
          return refusal(422, {
            code: 'CreatePaymentMethodSession.CurrencyRequired',
            detail: 'the customer has no live subscription: say which currency the payment method is set up in',
          });
        }

        return bodies.length === 2
          ? refusal(503, {
              code: 'CreatePaymentMethodSession.ProviderUnavailable',
              detail: 'the payment provider could not be reached',
            })
          : HttpResponse.json({
              expiresAt: '2027-03-10T13:00:00.000Z',
              sessionId: 'cs_3',
              url: 'https://checkout.stripe.test/c/setup/cs_3',
            });
      }),
    );
    serveBilling(null);
    renderCard();
    await userEvent.click(await screen.findByRole('button', { name: 'Add a payment method' }));
    const dialog = await screen.findByRole('dialog', { name: 'Currency of the payment method' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Pick a currency' }));
    await userEvent.click(await screen.findByRole('option', { name: 'EUR' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue to Stripe' }));

    const refused = await within(dialog).findByRole('alert');
    expect(refused).toHaveTextContent(
      'The payment provider could not be reached. Nothing was changed.',
    );
    await userEvent.click(within(refused).getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(leave).toHaveBeenCalledWith('https://checkout.stripe.test/c/setup/cs_3'),
    );
    expect(bodies.at(-1)).toEqual({
      currency: 'EUR',
      returnUrl: 'https://console.test/customers/acme',
    });
  });

  it('shows any other refusal in the card, in the API\'s words, and goes nowhere', async () => {
    server.use(
      handleCreatePaymentMethodSession(() =>
        refusal(422, {
          code: 'CreatePaymentMethodSession.ProviderNotConnected',
          detail: 'the payment provider is not connected for this organization',
        }),
      ),
    );
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'the payment provider is not connected for this organization',
    );
    expect(leave).not.toHaveBeenCalled();
  });
});

describe('managing it in the portal of Stripe', () => {
  it('opens the portal, coming back to the customer', async () => {
    const bodies: unknown[] = [];
    server.use(
      handleCreatePortalSession(async ({ request }) => {
        bodies.push(await request.json());

        return HttpResponse.json({ url: 'https://billing.stripe.test/p/session/bps_1' });
      }),
    );
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Manage in Stripe' }));

    await waitFor(() =>
      expect(leave).toHaveBeenCalledWith('https://billing.stripe.test/p/session/bps_1'),
    );
    expect(bodies).toEqual([{ returnUrl: 'https://console.test/customers/acme' }]);
  });

  it('asks again when Stripe could not be reached, and opens the portal', async () => {
    let asked = 0;
    server.use(
      handleCreatePortalSession(() => {
        asked += 1;

        return asked === 1
          ? refusal(503, {
              code: 'CreatePortalSession.ProviderUnavailable',
              detail: 'the payment provider could not be reached',
            })
          : HttpResponse.json({ url: 'https://billing.stripe.test/p/session/bps_2' });
      }),
    );
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Manage in Stripe' }));
    const refused = await screen.findByRole('alert');
    expect(refused).toHaveTextContent('Nothing was changed.');
    await userEvent.click(within(refused).getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(leave).toHaveBeenCalledWith('https://billing.stripe.test/p/session/bps_2'),
    );
  });

  it('shows a refusal in the API\'s words', async () => {
    server.use(
      handleCreatePortalSession(() =>
        refusal(422, {
          code: 'CreatePortalSession.CustomerNotOnProvider',
          detail: 'the customer is not in the payment provider yet',
        }),
      ),
    );
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Manage in Stripe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'the customer is not in the payment provider yet',
    );
  });
});

describe('removing the payment method', () => {
  const open = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    return screen.findByRole('alertdialog');
  };

  it('asks first, removes it, says so, and reads the customer again', async () => {
    const { reads, state } = serveBilling(VISA);
    const removed: string[] = [];
    server.use(
      handleDetachPaymentMethod(({ params }) => {
        removed.push(params.customerSlug);
        state.paymentMethod = null;

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderCard();

    const dialog = await open();
    expect(dialog).toHaveTextContent('Remove the payment method?');
    expect(removed).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removed).toEqual(['acme']));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Payment method removed'),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByText('No payment method on file')).toBeInTheDocument();
    expect(reads.count).toBe(2);
  });

  it('stays open while a contract is charged automatically, with the words of the API and what to do first', async () => {
    server.use(
      handleDetachPaymentMethod(() =>
        refusal(409, {
          code: 'DetachPaymentMethod.InUseByAutomaticCollection',
          detail: 'a live subscription of the customer is charged automatically: switch it to SEND_INVOICE first',
        }),
      ),
    );
    renderCard();

    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    const refused = await within(dialog).findByTestId('payment-method-remove-refused');
    expect(refused).toHaveTextContent('a live subscription of the customer is charged automatically');
    expect(refused).toHaveTextContent('in the Billing tab of their instance');
    expect(toast.success).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await method()).toHaveAttribute('data-standing', 'active');
  });

  it('shows any other refusal without the advice that is not for it', async () => {
    server.use(
      handleDetachPaymentMethod(() =>
        refusal(409, {
          code: 'DetachPaymentMethod.NoPaymentMethod',
          detail: 'the customer has no payment method to detach',
        }),
      ),
    );
    renderCard();

    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    const refused = await within(dialog).findByTestId('payment-method-remove-refused');
    expect(refused).toHaveTextContent('the customer has no payment method to detach');
    expect(refused).not.toHaveTextContent('Billing tab');
  });
});

describe('coming back from the page Stripe hosts', () => {
  const complete = (answer?: () => Response) => {
    const asked: Array<{ customerSlug: string; sessionId: string }> = [];
    server.use(
      handleCompletePaymentMethodSession(({ params }) => {
        asked.push({ customerSlug: params.customerSlug, sessionId: params.sessionId });

        return answer?.() ?? HttpResponse.json({ paymentMethod: VISA });
      }),
    );

    return asked;
  };

  it('has the API check the session with Stripe, says the card is saved, and drops the session from the address', async () => {
    const asked = complete();
    const { onSetupHandled } = renderCard({ setupSessionId: 'cs_9' });

    await waitFor(() =>
      expect(asked).toEqual([{ customerSlug: 'acme', sessionId: 'cs_9' }]),
    );
    await waitFor(() => expect(onSetupHandled).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith('Payment method saved');
  });

  it('reads what the customer holds once the session was checked, so that the read made first is not taken for the answer', async () => {
    const MASTERCARD: PaymentMethodLabels = {
      ...VISA,
      brand: 'mastercard',
      last4: '4444',
    };
    const order: string[] = [];
    const held = { paymentMethod: VISA };
    server.use(
      handleGetCustomerBilling(() => {
        order.push('read');

        return HttpResponse.json({
          billingEmail: 'ap@acme.test',
          providers: [
            {
              externalCustomerId: 'cus_acme',
              paymentMethod: held.paymentMethod,
              providerKind: 'STRIPE',
            },
          ],
        });
      }),
      handleCompletePaymentMethodSession(async () => {
        order.push('check');
        await delay(30);
        held.paymentMethod = MASTERCARD;

        return HttpResponse.json({ paymentMethod: MASTERCARD });
      }),
    );
    const onSetupHandled = vi.fn();
    const { rerender } = renderWithClient(
      <PaymentMethodCard
        customerSlug="acme"
        onSetupHandled={onSetupHandled}
        setupSessionId="cs_9"
      />,
    );

    await waitFor(() => expect(onSetupHandled).toHaveBeenCalledTimes(1));
    // Nothing was read while the session was being checked.
    expect(order).toEqual(['check']);
    // The route drops the session from the address: now the card is read.
    rerender(
      <PaymentMethodCard customerSlug="acme" onSetupHandled={onSetupHandled} />,
    );

    expect(await method()).toHaveTextContent('Mastercard ending in 4444');
    expect(order).toEqual(['check', 'read']);
  });

  it('asks once for a session however often the page draws again', async () => {
    const asked = complete();
    const { onSetupHandled } = renderCard({ setupSessionId: 'cs_9' });
    await waitFor(() => expect(onSetupHandled).toHaveBeenCalled());

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(asked).toHaveLength(1);
  });

  it('says the card was not saved when the customer left Stripe\'s page before the end, and tries again on request', async () => {
    let calls = 0;
    const asked = complete(() => {
      calls += 1;

      return calls === 1
        ? refusal(409, {
            code: 'CompletePaymentMethodSession.SessionNotComplete',
            detail: 'the customer has not finished saving a payment method on that page',
          })
        : HttpResponse.json({ paymentMethod: VISA });
    });
    const { onSetupHandled } = renderCard({ setupSessionId: 'cs_9' });

    const failed = await screen.findByTestId('payment-method-setup-failed');
    expect(failed).toHaveTextContent(
      'the customer has not finished saving a payment method on that page',
    );
    // The session is dropped from the address all the same: a reload does not ask again.
    await waitFor(() => expect(onSetupHandled).toHaveBeenCalledTimes(1));

    await userEvent.click(within(failed).getByRole('button', { name: 'Check again' }));

    await waitFor(() => expect(asked).toHaveLength(2));
    expect(asked[1]).toEqual({ customerSlug: 'acme', sessionId: 'cs_9' });
    await waitFor(() => expect(screen.queryByTestId('payment-method-setup-failed')).toBeNull());
  });

  it('only drops the session when the session may not write billing', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    const asked = complete();
    const { onSetupHandled } = renderCard({ setupSessionId: 'cs_9' });

    await waitFor(() => expect(onSetupHandled).toHaveBeenCalledTimes(1));
    expect(asked).toEqual([]);
  });

  it('only drops the session where Stripe is not connected', async () => {
    stripeIs('available');
    const asked = complete();
    const { onSetupHandled } = renderCard({ setupSessionId: 'cs_9' });

    await waitFor(() => expect(onSetupHandled).toHaveBeenCalledTimes(1));
    expect(asked).toEqual([]);
  });

  it('does nothing when the customer is not coming back from anywhere', async () => {
    const asked = complete();
    const { onSetupHandled } = renderCard();

    await method();
    expect(asked).toEqual([]);
    expect(onSetupHandled).not.toHaveBeenCalled();
  });
});
