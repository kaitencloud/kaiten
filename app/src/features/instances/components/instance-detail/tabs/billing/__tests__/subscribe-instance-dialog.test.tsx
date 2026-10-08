import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { NewSubscription, StartedSubscription } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleListLicensePrices,
  handleSubscribeInstance,
  handleUpdateCustomer,
} from '@/api-client/msw.gen';
import { buildPrice } from '../../../../../../../../e2e/app/_support/fixtures/build-pricing';
import { buildSubscription } from '../../../../../../../../e2e/app/_support/fixtures/build-subscription';
import { billingCapabilitiesProfiles } from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { SubscribeInstanceDialog } from '../subscribe/subscribe-instance-dialog';

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

const MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Business, monthly',
  id: 'price-monthly',
  isDefault: true,
  unitAmountDecimal: '9900',
});
const ANNUAL = buildPrice({
  billingPeriod: 'ANNUAL',
  billingTiming: 'ARREARS',
  displayLabel: 'Business, annual',
  displayOrder: 1,
  id: 'price-annual',
  unitAmountDecimal: '99000',
});
const USAGE = buildPrice({
  billingModel: 'USAGE_BASED',
  billingPeriod: undefined,
  displayLabel: 'Per call',
  id: 'price-usage',
  unitAmountDecimal: '0.1',
});
const RETIRED = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Old monthly',
  id: 'price-retired',
  status: 'DEPRECATED',
  unitAmountDecimal: '1000',
});

const customer = (billingEmail?: string) => ({
  billingEmail,
  domain: 'globex.com',
  externalCustomerId: 'hs-1',
  id: 'customer-1',
  name: 'Globex',
  slug: 'globex',
});

const license = (lifecycleState: 'ARCHIVED' | 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') => ({
  lifecycleState,
  name: 'Business',
  slug: 'business',
  version: '2',
});

beforeEach(() => {
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'write:billing', 'write:customers']),
  );
  toast.error.mockReset();
  toast.success.mockReset();
  detail.current = {
    customer: customer('ap@globex.com'),
    instance: {
      id: 'ins-1',
      licenseSlug: 'business',
      name: 'Globex Production',
      slug: 'globex-production',
    },
    license: license(),
  };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleListLicensePrices({ body: [USAGE, ANNUAL, RETIRED, MONTHLY] }),
    handleGetBillingSettings({
      body: {
        defaultCollectionMethod: 'SEND_INVOICE',
        defaultDaysUntilDue: 30,
        handoffStripeInvoices: false,
      },
    }),
  );
});

const started = (overrides: Partial<StartedSubscription> = {}): StartedSubscription => ({
  ...buildSubscription({
    anchorAt: '2027-03-15T10:00:00.000Z',
    basePrice: MONTHLY,
    instanceSlug: 'globex-production',
  }),
  activationInvoice: undefined,
  ...overrides,
}) as StartedSubscription;

/** Records the bodies of the subscriptions the API is asked to start. */
function serveSubscribe(answer?: (body: NewSubscription) => Response) {
  const bodies: NewSubscription[] = [];
  server.use(
    handleSubscribeInstance(async ({ request }) => {
      const body = (await request.json()) as NewSubscription;
      bodies.push(body);

      return answer?.(body) ?? HttpResponse.json(started(), { status: 201 });
    }),
  );

  return bodies;
}

const renderDialog = (onClose = vi.fn()) => {
  const view = renderWithClient(<SubscribeInstanceDialog onClose={onClose} />);

  return { onClose, unmount: view.unmount };
};

/** The text of a time input for a moment some days before now, in UTC, as the input holds it. */
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 16);

// A time input takes the whole text at once: typing it key by key is no way to fill one.
const setStart = (value: string) => {
  const input = screen.getByLabelText('Billing starts (UTC)');

  fireEvent.change(input, { target: { value } });
  // A field says what is wrong with it once the person has left it.
  fireEvent.blur(input);
};

const subscribe = () => screen.findByRole('button', { name: 'Subscribe' });
const baseField = () => screen.findByRole('combobox', { name: /Base price/ });

describe('the subscribe dialog', () => {
  it('names the instance and offers the active flat fees of its version, the default first and nothing metered', async () => {
    renderDialog();

    expect(
      await screen.findByRole('dialog', { name: 'Subscribe Globex Production' }),
    ).toBeInTheDocument();
    await userEvent.click(await baseField());

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Business, monthly · $99.00/month · In advance',
      'Business, annual · $990.00/year · In arrears',
    ]);
  });

  it('says the provider is told and not asked: manual, with the handoff to the ERP', async () => {
    renderDialog();

    expect(await screen.findByText('Manual')).toBeInTheDocument();
    expect(
      screen.getByText(/Invoices are recorded here and handed to your ERP/),
    ).toBeInTheDocument();
  });

  it('says what the terms of the organization come to on the field that leaves them empty', async () => {
    renderDialog();

    expect(
      await screen.findByPlaceholderText('Organization default: 30'),
    ).toBeInTheDocument();
  });

  it('says only that they are the organization\'s when it cannot read them', async () => {
    server.use(
      handleGetBillingSettings(() => refusal(403, { code: 'Auth.MissingScope', detail: 'no' })),
    );
    renderDialog();

    expect(await screen.findByPlaceholderText('Organization default')).toBeInTheDocument();
  });

  it('tells when the first invoice is issued, now for a price billed in advance', async () => {
    renderDialog();

    expect(await screen.findByTestId('subscribe-summary')).toHaveTextContent(
      'The first invoice is issued as soon as the subscription starts.',
    );
  });

  it('tells it is issued when the first period closes for a price billed in arrears, and never how much', async () => {
    renderDialog();
    await userEvent.click(await baseField());
    await userEvent.click(await screen.findByRole('option', { name: /Business, annual/ }));

    const summary = screen.getByTestId('subscribe-summary');
    await waitFor(() =>
      expect(summary).toHaveTextContent('Nothing is invoiced until the first period closes'),
    );
    expect(summary).toHaveTextContent(/the first invoice is issued on [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    expect(summary.textContent).not.toMatch(/\$/);
  });

  it('starts a subscription with the price and no trial when nothing else was asked', async () => {
    const bodies = serveSubscribe();
    renderDialog();

    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    // The trial is said even when it is none, so that what the license carries
    // does not apply behind the back of the person who read the form.
    expect(bodies[0]).toEqual({
      basePriceId: 'price-monthly',
      providerKind: 'NOOP',
      trialDays: 0,
    });
  });

  it('sends the terms and the start that were typed', async () => {
    const bodies = serveSubscribe();
    renderDialog();
    const days = await screen.findByLabelText('Payment terms (days)');

    const start = daysFromNow(-10);

    await userEvent.type(days, '45');
    setStart(start);
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      basePriceId: 'price-monthly',
      daysUntilDue: 45,
      providerKind: 'NOOP',
    });
    // Read as UTC, whatever the zone of the browser.
    expect(bodies[0].startAt).toBe(`${start}:00.000Z`);
  });

  it('sends one request however often it is pressed', async () => {
    let calls = 0;
    server.use(
      handleSubscribeInstance(async () => {
        calls += 1;
        await delay(150);

        return HttpResponse.json(started(), { status: 201 });
      }),
    );
    renderDialog();
    const button = await subscribe();

    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(await screen.findByTestId('subscribed')).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('says it started, with the period and the way to the invoice of the first period', async () => {
    serveSubscribe(() =>
      HttpResponse.json(
        started({
          activationInvoice: {
            currency: 'USD',
            id: 'inv-activation',
            total: 9900,
          } as StartedSubscription['activationInvoice'],
        }),
        { status: 201 },
      ),
    );
    const { onClose } = renderDialog();

    await userEvent.click(await subscribe());

    const done = await screen.findByTestId('subscribed');
    expect(done).toHaveTextContent('Subscription started');
    expect(done).toHaveTextContent('Active');
    expect(done).toHaveTextContent('$99.00');
    expect(within(done).getByRole('link', { name: 'View the invoice' })).toHaveAttribute(
      'href',
      '/billing/invoices/$invoiceId',
    );
    expect(
      within(done).getByRole('link', { name: 'View the invoice' }),
    ).toHaveAttribute('data-params', '{"invoiceId":"inv-activation"}');
    // The form is gone: nothing can be sent twice from here.
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('says the first invoice is issued later when the price bills in arrears and nothing was issued', async () => {
    serveSubscribe();
    renderDialog();

    await userEvent.click(await subscribe());

    expect(await screen.findByTestId('subscribed')).toHaveTextContent(
      'Nothing is invoiced yet: the first invoice is issued on',
    );
  });
});

describe('a refusal of the subscription', () => {
  it('goes on the field it is about, in the words of the API, and leaves the dialog open with what was typed', async () => {
    serveSubscribe(() =>
      refusal(422, {
        code: 'SubscribeInstance.StartAtTooEarly',
        detail: 'startAt must be on or after 2027-02-15T09:30:00Z',
      }),
    );
    renderDialog();
    const start = await screen.findByLabelText('Billing starts (UTC)');
    const typed = daysFromNow(-10);
    setStart(typed);

    await userEvent.click(await subscribe());

    expect(
      await screen.findByText('startAt must be on or after 2027-02-15T09:30:00Z'),
    ).toBeInTheDocument();
    expect(start).toHaveValue(typed);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('subscribed')).toBeNull();
  });

  it('shows one that is about no field above the buttons, and lets the person send again', async () => {
    let calls = 0;
    serveSubscribe(() => {
      calls += 1;

      return calls === 1
        ? refusal(409, {
            code: 'SubscribeInstance.AlreadySubscribed',
            detail: 'Instance "globex-production" already has a live subscription',
          })
        : HttpResponse.json(started(), { status: 201 });
    });
    renderDialog();

    await userEvent.click(await subscribe());
    expect(
      await screen.findByText('Instance "globex-production" already has a live subscription'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(await subscribe());

    expect(await screen.findByTestId('subscribed')).toBeInTheDocument();
  });

  it('is told before it is asked when the start is in the future, or before the period of the price', async () => {
    const bodies = serveSubscribe();
    renderDialog();
    await screen.findByLabelText('Billing starts (UTC)');

    setStart(daysFromNow(5));
    expect(await screen.findByText('Billing cannot start in the future')).toBeInTheDocument();

    // The price chosen is monthly: a start of two months ago is before its period.
    setStart(daysFromNow(-70));
    expect(
      await screen.findByText('Billing cannot start more than one billing period ago'),
    ).toBeInTheDocument();
    await userEvent.click(await subscribe());
    expect(bodies).toHaveLength(0);
  });
});

describe('what cannot be subscribed to', () => {
  it('says so, with no form, for a license version that is not published', async () => {
    detail.current = { ...detail.current, license: license('DRAFT') };
    renderDialog();

    const notice = await screen.findByTestId('subscribe-unavailable');
    expect(notice).toHaveTextContent('Business v2 is not published');
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
  });

  it('says so for a version with no active flat fee to pin the subscription to', async () => {
    server.use(handleListLicensePrices({ body: [USAGE, RETIRED] }));
    renderDialog();

    expect(await screen.findByTestId('subscribe-unavailable')).toHaveTextContent(
      'Business v2 has no active flat fee to subscribe to',
    );
  });

  it('shows a refusal of the prices with a way to ask again', async () => {
    let calls = 0;
    server.use(
      handleListLicensePrices(() => {
        calls += 1;

        return calls === 1
          ? refusal(503, { detail: 'Prices are unavailable' })
          : HttpResponse.json([MONTHLY]);
      }),
    );
    renderDialog();

    expect(await screen.findByText('Prices are unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await baseField()).toBeInTheDocument();
  });
});

describe('the billing e-mail of the customer', () => {
  beforeEach(() => {
    detail.current = { ...detail.current, customer: customer(undefined) };
  });

  it('is asked for beside the subscription when the customer has none, and not when it has one', async () => {
    const { unmount } = renderDialog();
    expect(await screen.findByTestId('billing-email-notice')).toHaveTextContent(
      'Globex has no billing e-mail',
    );
    unmount();

    detail.current = { ...detail.current, customer: customer('ap@globex.com') };
    renderDialog();
    await subscribe();

    expect(screen.queryByTestId('billing-email-notice')).toBeNull();
  });

  it('sets it with a request of its own, without subscribing', async () => {
    const bodies = serveSubscribe();
    const updates: unknown[] = [];
    server.use(
      handleUpdateCustomer(async ({ request }) => {
        updates.push(await request.json());

        return HttpResponse.json({ ...customer('ap@globex.com'), createdAt: '', updatedAt: '' });
      }),
    );
    renderDialog();

    await userEvent.type(await screen.findByLabelText('Billing e-mail'), ' ap@globex.com ');
    await userEvent.click(screen.getByRole('button', { name: 'Save e-mail' }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      billingEmail: 'ap@globex.com',
      domain: 'globex.com',
      externalCustomerId: 'hs-1',
      name: 'Globex',
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Billing e-mail saved'));
    expect(bodies).toHaveLength(0);
  });

  it('does not subscribe when Enter is pressed in its field: it sets the address and nothing else', async () => {
    const bodies = serveSubscribe();
    const updates: unknown[] = [];
    server.use(
      handleUpdateCustomer(async ({ request }) => {
        updates.push(await request.json());

        return HttpResponse.json({ ...customer('ap@globex.com'), createdAt: '', updatedAt: '' });
      }),
    );
    renderDialog();

    await userEvent.type(await screen.findByLabelText('Billing e-mail'), 'ap@globex.com{Enter}');

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(bodies).toHaveLength(0);
  });

  it('tells an address that is not one, in the words of the customer form, and sends nothing', async () => {
    const updates: unknown[] = [];
    server.use(
      handleUpdateCustomer(async ({ request }) => {
        updates.push(await request.json());

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDialog();

    await userEvent.type(await screen.findByLabelText('Billing e-mail'), 'not an address');
    await userEvent.click(screen.getByRole('button', { name: 'Save e-mail' }));

    expect(
      await screen.findByText('Enter a valid e-mail address, such as billing@acme.com'),
    ).toBeInTheDocument();
    expect(updates).toHaveLength(0);
  });

  it('only says so to a session that may not write customers', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'write:billing']));
    renderDialog();

    const notice = await screen.findByTestId('billing-email-notice');
    await waitFor(() => expect(within(notice).queryByLabelText('Billing e-mail')).toBeNull());
    expect(notice).toHaveTextContent('Globex has no billing e-mail');
  });

  it('can be left for later: the subscription goes ahead without it', async () => {
    const bodies = serveSubscribe();
    renderDialog();

    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
  });
});

describe('the trial of a subscription', () => {
  const withTrial = (days: number | undefined) => {
    detail.current = {
      ...detail.current,
      license: { ...license(), trialPeriodDays: days },
    };
  };
  const trialField = () => screen.findByLabelText('Trial (days)');

  it('starts at the days the license carries and says when the first invoice is issued, as nothing is invoiced meanwhile', async () => {
    withTrial(14);
    renderDialog();

    expect(await trialField()).toHaveValue('14');
    const summary = screen.getByTestId('subscribe-summary');
    await waitFor(() =>
      expect(summary).toHaveTextContent(
        'No invoice now. The first invoice is issued at the end of the trial, on',
      ),
    );
    expect(summary).toHaveTextContent(/on [A-Z][a-z]{2} \d{1,2}, \d{4}/);
  });

  it('starts at none for a license that carries no trial', async () => {
    withTrial(undefined);
    renderDialog();

    expect(await trialField()).toHaveValue('0');
    expect(screen.getByTestId('subscribe-summary')).toHaveTextContent(
      'The first invoice is issued as soon as the subscription starts.',
    );
  });

  it('sends the days that were typed, in place of the license\'s', async () => {
    withTrial(14);
    const bodies = serveSubscribe();
    renderDialog();
    const days = await trialField();

    await userEvent.clear(days);
    await userEvent.type(days, '7');
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ basePriceId: 'price-monthly', trialDays: 7 });
  });

  it('sends none when the trial is set to zero, which starts billing at once', async () => {
    withTrial(14);
    const bodies = serveSubscribe();
    renderDialog();
    const days = await trialField();

    await userEvent.clear(days);
    await userEvent.type(days, '0');
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].trialDays).toBe(0);
  });

  it('refuses a trial longer than the console takes, in words, and sends nothing', async () => {
    withTrial(14);
    const bodies = serveSubscribe();
    renderDialog();
    const days = await trialField();

    await userEvent.clear(days);
    await userEvent.type(days, '366');
    fireEvent.blur(days);

    expect(
      await screen.findByText('Enter a whole number of days, from 0 to 365'),
    ).toBeInTheDocument();
    expect(await subscribe()).toBeDisabled();
    expect(bodies).toHaveLength(0);
  });

  it('offers no trial on a price billed in arrears, whatever the license says, and starts the subscription with none', async () => {
    withTrial(14);
    const bodies = serveSubscribe();
    renderDialog();
    await trialField();

    await userEvent.click(await baseField());
    await userEvent.click(await screen.findByRole('option', { name: /Business, annual/ }));

    expect(await screen.findByTestId('trial-unavailable')).toHaveTextContent(
      'A trial is not offered on a plan billed in arrears',
    );
    expect(screen.queryByLabelText('Trial (days)')).toBeNull();
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ basePriceId: 'price-annual', trialDays: 0 });
  });

  it('asks for no trial where the release has none, and says nothing of one to the API', async () => {
    const stack = billingCapabilitiesProfiles.stack();
    server.use(
      handleGetBillingCapabilities({
        body: { ...stack, features: { ...stack.features, trials: false } },
      }),
    );
    withTrial(14);
    const bodies = serveSubscribe();
    renderDialog();
    await subscribe();

    await waitFor(() => expect(screen.queryByLabelText('Trial (days)')).toBeNull());
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('trialDays');
  });

  it('says in the started state that the trial runs and when the first invoice is issued', async () => {
    withTrial(14);
    serveSubscribe(() =>
      HttpResponse.json(
        started({
          currentPeriodEnd: '2027-03-29T10:00:00.000Z',
          status: 'TRIAL',
          trialEndsAt: '2027-03-29T10:00:00.000Z',
        }),
        { status: 201 },
      ),
    );
    renderDialog();

    await userEvent.click(await subscribe());

    const done = await screen.findByTestId('subscribed');
    expect(done).toHaveTextContent('Trial');
    expect(done).toHaveTextContent(
      'The trial runs until Mar 29, 2027, 10:00 AM (UTC), and the first invoice is issued then.',
    );
  });
});
