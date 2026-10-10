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
  handleListAddonPrices,
} from '@/api-client/msw.gen';
import {
  refusal,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { AddonPricesTab } from '../prices';
import { renderScreen, SEATS_DRAFT, SEATS_V1, STORAGE_ARCHIVED } from './addon-test-support';

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
  displayOrder: 3,
  id: 'price-metered',
  metered: { entitlementSlug: 'api-calls', saleUnitFactor: '1' },
  unitAmountDecimal: '0.1',
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

  it('leave out the metered prices the API takes and never values, and say how many there are', async () => {
    server.use(handleListAddonPrices({ body: [MONTHLY, METERED] }));
    renderTab();

    await screen.findByText('Extra seat, monthly');

    expect(screen.queryByText('Usage-based')).toBeNull();
    expect(screen.getByText(/1 metered price, which billing does not value/)).toBeInTheDocument();
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
