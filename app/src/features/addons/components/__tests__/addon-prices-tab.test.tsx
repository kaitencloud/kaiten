import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { NewAddonPrice, Price } from '@/api-client';
import {
  handleCreateAddonPrice,
  handleDeprecateAddonPrice,
  handleGetAddon,
  handleGetBillingCapabilities,
  handleListAddonEntitlements,
  handleListAddonPrices,
  handleListEntitlements,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildAddonGrant, buildPrice } from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { AddonPricesTab } from '../prices';
import {
  ENTITLEMENTS,
  renderScreen,
  SEATS_DRAFT,
  SEATS_V1,
  seatsGrant,
  STORAGE_ARCHIVED,
} from './addon-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./addon-test-support')).createAddonRouterModule(navigate),
);

useBillingTexts();

const MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seat, monthly',
  displayOrder: 1,
  id: 'price-monthly',
  isDefault: true,
  unitAmountDecimal: '1000',
});
const MONTHLY_OLD = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seat, monthly (launch)',
  displayOrder: 2,
  id: 'price-monthly-old',
  unitAmountDecimal: '900',
});
const METERED = buildPrice({
  billingModel: 'USAGE_BASED',
  displayLabel: 'API calls, metered',
  displayOrder: 3,
  id: 'price-metered',
  metered: { entitlementSlug: 'api-calls', saleUnitFactor: '1' },
  unitAmountDecimal: '0.1',
});
// What the version grants: the seats it adds, a stock, and the calls, a flow a price may meter.
const API_CALLS_GRANT = buildAddonGrant({
  addonSlug: SEATS_DRAFT.slug,
  behavior: 'ADD',
  entitlementSlug: 'api-calls',
  value: 5000,
});

beforeEach(() => {
  navigate.mockReset();
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:addons', 'write:addons']),
  );
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
    handleGetAddon({ body: SEATS_DRAFT }),
    handleListAddonPrices({ body: [MONTHLY] }),
    handleListAddonEntitlements({ body: [seatsGrant(), API_CALLS_GRANT] }),
    handleListEntitlements({ body: pageOf(ENTITLEMENTS) }),
  );
});

const renderTab = (priceParam?: string) =>
  renderScreen(<AddonPricesTab addonSlug={SEATS_DRAFT.slug} priceParam={priceParam} />);

/** Records what the API is asked to price. */
function serveCreate(answer?: (body: NewAddonPrice) => Response) {
  const bodies: NewAddonPrice[] = [];
  server.use(
    handleCreateAddonPrice(async ({ request }) => {
      const body = (await request.json()) as NewAddonPrice;
      bodies.push(body);

      return (
        answer?.(body) ??
        HttpResponse.json(
          buildPrice({
            billingPeriod: body.billingPeriod,
            id: 'price-new',
            isDefault: Boolean(body.isDefault),
            unitAmountDecimal: body.unitAmountDecimal,
          }),
          { status: 201 },
        )
      );
    }),
  );

  return bodies;
}

const slot = async (period: 'ANNUAL' | 'MONTHLY') =>
  (await screen.findByRole('region', { name: 'Default price of each billing period' })).querySelector(
    `[data-period="${period}"]`,
  ) as HTMLElement;

describe('the prices of a version', () => {
  it('say, for each period it is sold for, which price bills it, and a missing annual price before a customer meets the refusal', async () => {
    renderTab();

    const monthly = await slot('MONTHLY');
    const annual = await slot('ANNUAL');

    expect(monthly).toHaveAttribute('data-status', 'default');
    expect(within(monthly).getByText('$10.00/month')).toBeInTheDocument();
    expect(annual).toHaveAttribute('data-status', 'missing');
    expect(annual).toHaveTextContent(
      'cannot be attached to a subscription with annual billing',
    );
  });

  it('list the flat fees with their default and their deprecation, in the order the API lists them', async () => {
    server.use(
      handleListAddonPrices({
        body: [MONTHLY, { ...MONTHLY_OLD, status: 'DEPRECATED', deprecatedAt: '2026-06-01T00:00:00.000Z' }],
      }),
    );
    renderTab();

    expect(await screen.findByText('Extra seat, monthly')).toBeInTheDocument();
    expect(screen.getByText('Extra seat, monthly (launch)')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText(/Deprecated Jun/)).toBeInTheDocument();
  });

  it('list the metered prices beside the flat fees, with what each measures and what it charges per unit', async () => {
    server.use(
      handleListAddonPrices({
        body: [
          MONTHLY,
          METERED,
          { ...METERED, billingModel: 'OVERAGE', displayLabel: 'Seats, overage', id: 'price-overage', metered: { entitlementSlug: 'seats', saleUnitFactor: '1' } },
        ],
      }),
    );
    renderTab();

    const metered = (await screen.findByText('API calls, metered')).closest('tr') as HTMLElement;
    const overage = screen.getByText('Seats, overage').closest('tr') as HTMLElement;

    expect(screen.getByText('Extra seat, monthly', { selector: 'span' })).toBeInTheDocument();
    expect(within(metered).getByText('Usage-based')).toBeInTheDocument();
    // What it measures: the entitlement by its name, and what it counts.
    expect(within(metered).getByText('API Calls')).toBeInTheDocument();
    expect(within(metered).getByText('Summed, resets every month')).toBeInTheDocument();
    expect(within(metered).getByText('$0.001')).toBeInTheDocument();
    expect(within(metered).getByText('In arrears')).toBeInTheDocument();
    expect(within(overage).getByText('Overage')).toBeInTheDocument();
    // An overage bills above what the instance holds: the add-on's grant alone does not say how much.
    expect(
      within(overage).getByText(
        'Bills the usage above the limit the instance holds: its license and its add-ons together',
      ),
    ).toBeInTheDocument();
  });

  it('expect no price of a period of a version that only meters usage, which attaches to any', async () => {
    server.use(handleListAddonPrices({ body: [METERED] }));
    renderTab();

    await screen.findByText('API calls, metered');

    expect(screen.queryByRole('region', { name: 'Default price of each billing period' })).toBeNull();
  });

  it('may be added to a version that is not archived, by a session that may write', async () => {
    renderTab();

    expect(await screen.findByRole('link', { name: 'Add price' })).toHaveAttribute(
      'href',
      '/catalog/addons/extra-seats-v2/prices?price=new',
    );
  });

  it('may not be added to an archived version, whose note says what it means', async () => {
    server.use(handleGetAddon({ body: STORAGE_ARCHIVED }));
    renderTab();

    await screen.findByRole('region', { name: 'Default price of each billing period' });

    expect(screen.queryByRole('link', { name: 'Add price' })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('takes no new price');
  });

  it('offer a new version beside the note of one that has been on sale', async () => {
    server.use(handleGetAddon({ body: SEATS_V1 }));
    renderTab();

    expect(await screen.findByRole('link', { name: 'New Version' })).toHaveAttribute(
      'href',
      '/catalog/addons/new?family=extra-seats',
    );
  });
});

describe('adding a price', () => {
  const fill = async (amount: string) => {
    await userEvent.type(await screen.findByLabelText(/Amount per unit/), amount);
  };
  const create = () => screen.findByRole('button', { name: 'Create price' });

  it('sends a flat fee, its amount in minor units, and the display order after the last price', async () => {
    const bodies = serveCreate();
    server.use(handleListAddonPrices({ body: [MONTHLY, MONTHLY_OLD] }));
    renderTab('new');

    await fill('12.50');
    await userEvent.click(await create());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      billingModel: 'FLAT_FEE',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      currency: 'USD',
      displayOrder: 3,
      isDefault: false,
      unitAmountDecimal: '1250',
    });
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it('is the default of a period that has none, which is the price that bills it', async () => {
    const bodies = serveCreate();
    server.use(handleListAddonPrices({ body: [] }));
    renderTab('new');

    await fill('10');
    await userEvent.click(await create());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.isDefault).toBe(true);
    // The first price has no display order of its own to follow.
    expect(bodies[0]?.displayOrder).toBeUndefined();
  });

  it('takes the currency of the version, which it locks', async () => {
    server.use(handleListAddonPrices({ body: [{ ...MONTHLY, currency: 'EUR' }] }));
    renderTab('new');

    const currency = await screen.findByLabelText(/Currency/);

    expect(currency).toHaveValue('EUR');
    expect(currency).toBeDisabled();
  });

  it('asks before it takes the place of the default of its period, naming the price it replaces, and sends nothing until the answer is yes', async () => {
    const bodies = serveCreate();
    renderTab('new');
    await fill('15');
    // The period already has a default: the new price is not one unless the person says so.
    await userEvent.click(await screen.findByRole('checkbox', { name: /Default price of this period/ }));

    await userEvent.click(await create());

    const question = await screen.findByRole('alertdialog');
    expect(question).toHaveTextContent('Extra seat, monthly');
    expect(question).toHaveTextContent('$10.00/month');
    expect(bodies).toEqual([]);

    await userEvent.click(within(question).getByRole('button', { name: 'Cancel' }));
    expect(bodies).toEqual([]);
    await userEvent.click(await create());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace the default' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ isDefault: true, unitAmountDecimal: '1500' });
  });

  it('shows the refusal of the amount on its field, in the words of the API', async () => {
    serveCreate(() =>
      refusal(422, {
        code: 'CreateAddonPrice.InvalidAmount',
        detail: 'unitAmountDecimal is a decimal string of minor units',
        errors: [{ location: 'body.unitAmountDecimal', message: 'unitAmountDecimal is a decimal string of minor units' }],
      }),
    );
    renderTab('new');
    await fill('10');

    await userEvent.click(await create());

    expect(await screen.findByText('unitAmountDecimal is a decimal string of minor units')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the refusal of another currency on the currency', async () => {
    serveCreate(() =>
      refusal(422, {
        code: 'CreateAddonPrice.CurrencyMismatch',
        detail: 'this add-on version already has prices in another currency',
      }),
    );
    renderTab('new');
    await fill('10');

    await userEvent.click(await create());

    expect(await screen.findByText('this add-on version already has prices in another currency')).toBeInTheDocument();
  });

  describe('a metered price', () => {
    const shape = async (name: RegExp) =>
      userEvent.click(await screen.findByRole('button', { name }));
    const entitlement = async (name: RegExp) =>
      userEvent.click(await screen.findByRole('button', { name }));
    // The label of the amount names the unit once an entitlement is picked.
    const fillAmount = async (amount: string) =>
      userEvent.type(await screen.findByLabelText(/Amount/), amount);

    it('measures an entitlement the version grants, in arrears, and sends no period and no default', async () => {
      const bodies = serveCreate();
      renderTab('new');

      await shape(/^Usage-based/);
      // The seats are a stock: listed, disabled, with the way to sell them; the calls are a flow.
      expect(await screen.findByRole('button', { name: /^Seats/ })).toHaveAttribute('aria-disabled', 'true');
      await entitlement(/^API Calls/);
      await fillAmount('0.075');
      expect(await screen.findByText('Reads as $0.075 per API Calls')).toBeInTheDocument();
      await userEvent.click(await create());

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({
        billingModel: 'USAGE_BASED',
        billingTiming: 'ARREARS',
        currency: 'USD',
        displayOrder: 2,
        meteredEntitlementSlug: 'api-calls',
        unitAmountDecimal: '7.5',
      });
      await waitFor(() => expect(navigate).toHaveBeenCalled());
    });

    it('says to bill a stock as a flat fee with a quantity, since its own price is where a stock is sold', async () => {
      renderTab('new');

      await shape(/^Usage-based/);

      expect(
        await screen.findByText(/cannot be metered: bill it as a flat fee with a quantity/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'See the add-ons' })).toBeNull();
    });

    it('does not ask to replace the default of a period for the flag it kept from the flat fee, which it never sends', async () => {
      const bodies = serveCreate();
      renderTab('new');
      await userEvent.click(await screen.findByRole('checkbox', { name: /Default price of this period/ }));
      await shape(/^Usage-based/);
      await entitlement(/^API Calls/);
      await fillAmount('1');

      await userEvent.click(await create());

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(bodies[0]).toMatchObject({ billingModel: 'USAGE_BASED', meteredEntitlementSlug: 'api-calls' });
      expect(bodies[0]).not.toHaveProperty('isDefault');
    });

    it('has no period, no timing to choose and no default, and says why the timing is not chosen', async () => {
      renderTab('new');

      await screen.findByLabelText(/Billing period/);
      await shape(/^Overage/);

      expect(screen.queryByLabelText(/Billing period/)).toBeNull();
      expect(screen.queryByLabelText(/Billing timing/)).toBeNull();
      expect(screen.queryByRole('checkbox', { name: /Default price of this period/ })).toBeNull();
      expect(
        screen.getByText('A metered price is always billed in arrears: usage cannot be billed before it happens.'),
      ).toBeInTheDocument();
      // An overage on any flow the version grants: the allowance is the instance's.
      expect(
        within(await screen.findByRole('button', { name: /^API Calls/ })).getByText(
          'Bills the usage above the limit the instance holds: its license and its add-ons together',
        ),
      ).toBeInTheDocument();
    });

    it('asks for the entitlement before it asks the API', async () => {
      const bodies = serveCreate();
      renderTab('new');
      await shape(/^Usage-based/);
      await fillAmount('1');

      await userEvent.click(await create());

      expect(await screen.findByText('Pick the entitlement this price measures.')).toBeInTheDocument();
      expect(bodies).toEqual([]);
    });

    it('does not offer an entitlement an active price of the version already meters', async () => {
      server.use(handleListAddonPrices({ body: [MONTHLY, METERED] }));
      renderTab('new');

      await shape(/^Usage-based/);

      // The calls are measured already; the seats, a stock, are listed and cannot be picked.
      expect(await screen.findByRole('button', { name: /^Seats/ })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByRole('button', { name: /^API Calls/ })).toBeNull();
    });

    it('keeps the entitlement picked while it still can be, when the shape changes', async () => {
      const bodies = serveCreate();
      renderTab('new');
      await shape(/^Usage-based/);
      await entitlement(/^API Calls/);
      await shape(/^Overage/);
      await fillAmount('2');

      await userEvent.click(await create());

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ billingModel: 'OVERAGE', meteredEntitlementSlug: 'api-calls' });
    });

    it.each([
      ['CreateAddonPrice.EntitlementAlreadyMetered', 'another active price of this add-on version already meters this entitlement'],
      ['CreateAddonPrice.EntitlementIsStock', 'only an entitlement with a reset period can be metered'],
      ['CreateAddonPrice.EntitlementNotGranted', 'the add-on version does not grant this entitlement'],
      ['CreateAddonPrice.UnsupportedAggregation', 'only a SUM or COUNT entitlement can be metered'],
      ['CreateAddonPrice.UnsupportedEntitlementType', 'only a NUMBER or NUMBER_AI_CREDIT entitlement can be metered'],
    ])('shows %s on the entitlement, in the words of the API', async (code, detail) => {
      serveCreate(() => refusal(422, { code, detail }));
      renderTab('new');
      await shape(/^Usage-based/);
      await entitlement(/^API Calls/);
      await fillAmount('1');

      await userEvent.click(await create());

      expect(await screen.findByText(detail)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('takes the refusal off the entitlement once another is picked', async () => {
      serveCreate(() =>
        refusal(422, {
          code: 'CreateAddonPrice.EntitlementAlreadyMetered',
          detail: 'another active price of this add-on version already meters this entitlement',
        }),
      );
      renderTab('new');
      await shape(/^Usage-based/);
      await entitlement(/^API Calls/);
      await fillAmount('1');
      await userEvent.click(await create());
      await screen.findByText(/already meters this entitlement/);

      await shape(/^Overage/);
      await entitlement(/^API Calls/);

      expect(screen.getByText(/already meters this entitlement/)).toBeInTheDocument();
    });
  });

  it('leads to a new version when an instance with a live subscription holds this one', async () => {
    serveCreate(() =>
      refusal(409, {
        code: 'CreateAddonPrice.BillingActive',
        detail: 'an instance with a live subscription holds this add-on version',
      }),
    );
    renderTab('new');
    await fill('10');

    await userEvent.click(await create());

    const frozen = await screen.findByRole('alertdialog');
    expect(within(frozen).getByRole('link', { name: 'Create a new version' })).toBeInTheDocument();
  });

  it('leaves a link to a drawer that cannot open: an archived version, or a session that may not write', async () => {
    server.use(handleGetAddon({ body: STORAGE_ARCHIVED }));
    renderTab('new');

    expect(await screen.findByTestId('left')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('deprecating a price', () => {
  beforeEach(() => {
    server.use(handleListAddonPrices({ body: [MONTHLY, MONTHLY_OLD] }));
  });

  it('is not offered for the default of a period, which bills every instance holding the version: the button is there, disabled', async () => {
    renderTab();

    const button = await screen.findByRole('button', { name: /Deprecate Extra seat, monthly$/ });

    // Focusable, so that the keyboard reaches the way out it points to: it is
    // disabled for assistive technology, not removed.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks first, and says what deprecating changes and what it does not', async () => {
    const deprecated = vi.fn();
    server.use(
      handleDeprecateAddonPrice(({ params }) => {
        deprecated(params.priceId);

        return HttpResponse.json({ ...MONTHLY_OLD, status: 'DEPRECATED' });
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: /Deprecate Extra seat, monthly \(launch\)/ }));
    const question = await screen.findByRole('alertdialog');
    expect(deprecated).not.toHaveBeenCalled();
    expect(question).toHaveTextContent('already billed');

    await userEvent.click(within(question).getByRole('button', { name: 'Deprecate' }));

    await waitFor(() => expect(deprecated).toHaveBeenCalledWith('price-monthly-old'));
  });

  it('says a metered price produces no line from the next invoice, rather than that the instances billed from it keep being', async () => {
    const deprecated = vi.fn();
    server.use(
      handleListAddonPrices({ body: [MONTHLY, METERED] }),
      handleDeprecateAddonPrice(({ params }) => {
        deprecated(params.priceId);

        return HttpResponse.json({ ...METERED, status: 'DEPRECATED' });
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Deprecate API calls, metered' }));
    const question = await screen.findByRole('alertdialog');

    expect(question).toHaveTextContent('produces no line from the next invoice on');
    expect(question).not.toHaveTextContent('keep being billed');
    await userEvent.click(within(question).getByRole('button', { name: 'Deprecate' }));
    await waitFor(() => expect(deprecated).toHaveBeenCalledWith('price-metered'));
  });

  it('shows a refusal in the dialog, which stays open', async () => {
    server.use(
      handleDeprecateAddonPrice(() =>
        refusal(409, {
          code: 'DeprecateAddonPrice.IsDefault',
          detail: 'the default price of a period bills every instance holding this version',
        }),
      ),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: /Deprecate Extra seat, monthly \(launch\)/ }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deprecate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('bills every instance holding this version');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('is not offered to a session that may not write add-ons', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:addons']));
    renderTab();

    await screen.findByText('Extra seat, monthly (launch)');

    expect(screen.queryByRole('button', { name: /Deprecate/ })).toBeNull();
  });

  it('is not offered for a price already deprecated', async () => {
    server.use(
      handleListAddonPrices({
        body: [MONTHLY, { ...MONTHLY_OLD, status: 'DEPRECATED' } as Price],
      }),
    );
    renderTab();

    await screen.findByText('Extra seat, monthly (launch)');

    expect(screen.queryByRole('button', { name: /Deprecate Extra seat, monthly \(launch\)/ })).toBeNull();
  });
});
