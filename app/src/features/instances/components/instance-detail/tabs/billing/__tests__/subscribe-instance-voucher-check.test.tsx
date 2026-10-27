import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { server } from '@/__tests__/msw-server';
import type {
  NewSubscription,
  StartedSubscription,
  Validity,
  VoucherCheck,
} from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleListAddonCompatibility,
  handleListAddons,
  handleListInstanceAddons,
  handleListLicenseFamilies,
  handleListLicensePrices,
  handleSubscribeInstance,
  handleValidateVoucher,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildPrice } from '../../../../../../../../e2e/app/_support/fixtures/build-pricing';
import { buildSubscription } from '../../../../../../../../e2e/app/_support/fixtures/build-subscription';
import { billingCapabilitiesProfiles } from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { SubscribeInstanceDialog } from '../subscribe/subscribe-instance-dialog';
import { STORAGE_BOOST, WELCOME } from '../vouchers/__tests__/vouchers-fixtures';

// The code typed in the dialog that subscribes an instance can be checked against the price
// chosen before the subscription is sent. The check is the same verdict the dialog that
// applies a code gives, asked with the price the subscription would start on; it writes
// nothing, never keeps the subscription from being sent, and the subscription still carries
// the code and stays the authority.

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../instance-detail-context', () => ({
  useInstanceDetail: () => detail.current,
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={to}>
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
  displayLabel: 'Business, annual',
  displayOrder: 1,
  id: 'price-annual',
  unitAmountDecimal: '99000',
});

beforeEach(() => {
  getAuthToken.mockResolvedValue(
    sessionToken([
      'read:billing',
      'write:billing',
      'read:instances',
      'read:addons',
      'read:licenses',
      'write:voucher_redemptions',
    ]),
  );
  detail.current = {
    customer: { billingEmail: 'ap@globex.com', id: 'customer-1', name: 'Globex', slug: 'globex' },
    entitlements: [{ name: 'Storage', slug: 'storage-gb' }],
    instance: {
      id: 'ins-1',
      licenseSlug: 'business',
      name: 'Globex Production',
      slug: 'globex-production',
    },
    license: { familyId: 'family-business', lifecycleState: 'PUBLISHED', name: 'Business', slug: 'business', version: '2' },
  };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithVouchers() }),
    handleListLicensePrices({ body: [MONTHLY, ANNUAL] }),
    handleGetBillingSettings({
      body: { defaultCollectionMethod: 'SEND_INVOICE', defaultDaysUntilDue: 30, handoffStripeInvoices: false },
    }),
    handleListInstanceAddons({ body: [] }),
    handleListAddons({ body: pageOf([]) }),
    handleListLicenseFamilies({ body: pageOf([]) }),
    handleListAddonCompatibility({ body: { familySlugs: [] } }),
  );
});

/** What the API is asked to check, and what it answers. */
function serveCheck(answer: (body: VoucherCheck) => Response) {
  const checked: VoucherCheck[] = [];
  server.use(
    handleValidateVoucher(async ({ request }) => {
      const body = (await request.json()) as VoucherCheck;
      checked.push(body);

      return answer(body);
    }),
  );

  return checked;
}

const valid = (voucher = STORAGE_BOOST) =>
  HttpResponse.json({ valid: true, voucher } as Validity);

/** The subscriptions the API is asked to start. */
function serveSubscribe() {
  const bodies: NewSubscription[] = [];
  server.use(
    handleSubscribeInstance(async ({ request }) => {
      bodies.push((await request.json()) as NewSubscription);

      return HttpResponse.json(
        {
          ...buildSubscription({
            anchorAt: '2027-03-15T10:00:00.000Z',
            basePrice: MONTHLY,
            instanceSlug: 'globex-production',
          }),
          activationInvoice: undefined,
        } as StartedSubscription,
        { status: 201 },
      );
    }),
  );

  return bodies;
}

const renderDialog = () => renderWithClient(<SubscribeInstanceDialog onClose={vi.fn()} />);
const codeField = () => screen.findByLabelText(/^Voucher code/);
const checkButton = () => screen.findByRole('button', { name: 'Check the code' });
const subscribe = () => screen.findByRole('button', { name: 'Subscribe' });

describe('checking the code before the subscription is sent', () => {
  it('offers the check beside the code, and not before there is a code to check', async () => {
    renderDialog();

    await codeField();
    expect(await checkButton()).toBeDisabled();

    await userEvent.type(await codeField(), 'storage-boost-50');
    expect(await checkButton()).toBeEnabled();
    expect(screen.getByText(/You can check it first, against the price chosen/)).toBeInTheDocument();
  });

  it('is not offered where the code itself is not: no vouchers in the release, or none for the session to redeem', async () => {
    getAuthToken.mockResolvedValue(
      sessionToken(['read:billing', 'write:billing', 'read:instances', 'read:addons', 'read:licenses']),
    );
    renderDialog();

    await subscribe();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByRole('button', { name: 'Check the code' })).toBeNull();
  });

  it('asks the API about the code, the instance and the price the subscription would start on', async () => {
    const checked = serveCheck(() => valid());
    renderDialog();
    await userEvent.type(await codeField(), '  storage-boost-50 ');

    await userEvent.click(await checkButton());

    await waitFor(() => expect(checked).toHaveLength(1));
    // The default price: the one the subscription starts on when none is chosen.
    expect(checked[0]).toEqual({
      code: 'storage-boost-50',
      instanceSlug: 'globex-production',
      licensePriceId: 'price-monthly',
    });
  });

  it('shows what the code offers, as the dialog that applies a code does, and says it is checked again', async () => {
    serveCheck(() => valid());
    renderDialog();
    await userEvent.type(await codeField(), 'storage-boost-50');

    await userEvent.click(await checkButton());

    const verdict = await screen.findByTestId('redeem-verdict-valid');
    expect(verdict).toHaveTextContent('Storage boost can be redeemed');
    expect(verdict).toHaveTextContent('Storage + 50, for 2 billing periods');
    expect(verdict).toHaveTextContent(
      'It can be redeemed with this subscription, on the price chosen. The subscription checks it again when it starts.',
    );
    // It is not the sentence about redeeming it now: nothing is redeemed by a check.
    expect(verdict).not.toHaveTextContent('Redeeming applies it now');
  });

  it('says which check a code fails, and for an instance that does not meet the voucher, which condition', async () => {
    serveCheck(() =>
      HttpResponse.json({
        reason: 'NOT_ELIGIBLE',
        rule: 'ANNUAL_ONLY',
        valid: false,
        voucher: WELCOME,
      } as Validity),
    );
    renderDialog();
    await userEvent.type(await codeField(), 'welcome-spring-2027');

    await userEvent.click(await checkButton());

    const verdict = await screen.findByTestId('redeem-verdict-invalid');
    expect(verdict).toHaveTextContent('This code cannot be redeemed');
    expect(verdict).toHaveTextContent('annual');
  });

  it('forgets the verdict as soon as the code is edited, which it was not about', async () => {
    serveCheck(() => valid());
    renderDialog();
    await userEvent.type(await codeField(), 'storage-boost-50');
    await userEvent.click(await checkButton());
    await screen.findByTestId('redeem-verdict-valid');

    await userEvent.type(await codeField(), '0');

    expect(screen.queryByTestId('redeem-verdict-valid')).toBeNull();
    // Typing the code back is the pair the verdict answered for: it is shown again.
    await userEvent.type(await codeField(), '{Backspace}');
    expect(await screen.findByTestId('redeem-verdict-valid')).toBeInTheDocument();
  });

  it('forgets it when the price is changed, and asks again with the price now chosen', async () => {
    const checked = serveCheck(() => valid());
    renderDialog();
    await userEvent.type(await codeField(), 'storage-boost-50');
    await userEvent.click(await checkButton());
    await screen.findByTestId('redeem-verdict-valid');

    await userEvent.click(await screen.findByRole('combobox', { name: /Base price/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Business, annual/ }));

    await waitFor(() => expect(screen.queryByTestId('redeem-verdict-valid')).toBeNull());
    await userEvent.click(await checkButton());
    await screen.findByTestId('redeem-verdict-valid');
    expect(checked.map((body) => body.licensePriceId)).toEqual(['price-monthly', 'price-annual']);
  });

  it('keeps nothing from the subscription: it carries the code as typed and is sent whatever the verdict', async () => {
    serveCheck(() =>
      HttpResponse.json({ reason: 'EXPIRED', valid: false, voucher: WELCOME } as Validity),
    );
    const bodies = serveSubscribe();
    renderDialog();
    await userEvent.type(await codeField(), 'welcome-spring-2027');
    await userEvent.click(await checkButton());
    await screen.findByTestId('redeem-verdict-invalid');

    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      basePriceId: 'price-monthly',
      voucherCode: 'welcome-spring-2027',
    });
  });

  describe('when the check itself is refused', () => {
    it('says a limit on the checks is temporary, in the words of the API, and checks again when asked', async () => {
      let calls = 0;
      const checked = serveCheck(() => {
        calls += 1;

        return calls === 1
          ? refusal(429, {
              code: 'ValidateVoucher.RateLimited',
              detail: 'too many voucher codes checked: try again later',
            })
          : valid();
      });
      renderDialog();
      await userEvent.type(await codeField(), 'storage-boost-50');

      await userEvent.click(await checkButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('too many voucher codes checked: try again later');
      expect(alert).toHaveTextContent('This is temporary: try again in a minute.');
      await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

      expect(await screen.findByTestId('redeem-verdict-valid')).toBeInTheDocument();
      expect(checked).toHaveLength(2);
      expect(screen.queryByText(/too many voucher codes checked/)).toBeNull();
    });

    it('does not keep the subscription from being sent', async () => {
      serveCheck(() =>
        refusal(429, { code: 'ValidateVoucher.RateLimited', detail: 'too many voucher codes checked' }),
      );
      const bodies = serveSubscribe();
      renderDialog();
      await userEvent.type(await codeField(), 'storage-boost-50');
      await userEvent.click(await checkButton());
      await screen.findByRole('alert');

      await userEvent.click(await subscribe());

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ voucherCode: 'storage-boost-50' });
    });

    it('shows the words of the API for a price that does not exist', async () => {
      serveCheck(() =>
        refusal(404, {
          code: 'ValidateVoucher.PriceNotFound',
          detail: 'no flat-fee licence price price-monthly',
        }),
      );
      renderDialog();
      await userEvent.type(await codeField(), 'storage-boost-50');

      await userEvent.click(await checkButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'no flat-fee licence price price-monthly',
      );
    });

    it('names the scope a session lacks, which the check needs, and keeps the rest of the dialog', async () => {
      serveCheck(() =>
        refusal(403, {
          code: 'Auth.MissingScope',
          detail: 'missing required scope: read:voucher_redemptions',
        }),
      );
      renderDialog();
      await userEvent.type(await codeField(), 'storage-boost-50');

      await userEvent.click(await checkButton());

      expect(await screen.findByText('read:voucher_redemptions')).toBeInTheDocument();
      expect(await subscribe()).toBeEnabled();
    });
  });

  it('keeps the code out of every address, storage and key of the cache of the page', async () => {
    serveCheck(() => valid());
    const { client } = renderDialog();
    await userEvent.type(await codeField(), 'storage-boost-50');
    await userEvent.click(await checkButton());
    await screen.findByTestId('redeem-verdict-valid');

    expect(window.location.href).not.toMatch(/storage-boost/i);
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toMatch(
      /storage-boost/i,
    );
    expect(
      JSON.stringify(client.getQueryCache().getAll().map(({ queryKey }) => queryKey)),
    ).not.toMatch(/storage-boost/i);
    expect(
      JSON.stringify(client.getMutationCache().getAll().map(({ options }) => options.mutationKey)),
    ).not.toMatch(/storage-boost/i);
  });

  it('sends one request however often it is pressed while it is on its way', async () => {
    let calls = 0;
    server.use(
      handleValidateVoucher(async () => {
        calls += 1;
        await delay(150);

        return valid();
      }),
    );
    renderDialog();
    await userEvent.type(await codeField(), 'storage-boost-50');
    const button = await checkButton();

    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    await screen.findByTestId('redeem-verdict-valid');
    expect(calls).toBe(1);
  });

  it('is said in French with the words of the console', async () => {
    await testI18n.changeLanguage('fr');
    serveCheck(() => valid());
    renderDialog();
    await userEvent.type(await screen.findByLabelText(/^Code promo/), 'storage-boost-50');

    await userEvent.click(await screen.findByRole('button', { name: 'Vérifier le code' }));

    const verdict = await screen.findByTestId('redeem-verdict-valid');
    expect(verdict).toHaveTextContent('Storage boost peut être utilisé');
    expect(verdict).toHaveTextContent(
      'Il peut être utilisé avec cet abonnement, sur le prix choisi.',
    );
    await testI18n.changeLanguage('en');
  });
});
