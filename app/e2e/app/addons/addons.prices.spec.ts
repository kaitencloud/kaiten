import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { expectNoToast } from '../_support/assertions/toast';
import { AddonFreezeDriver } from '../_support/drivers/addon-freeze.driver';
import { AddonPricesDriver } from '../_support/drivers/addon-prices.driver';
import { createAddonsBillingModel } from './addons.scenarios';
import { installAddonsWorld } from './install-addons-world';

// What one unit of an add-on is billed: a flat fee for each billing period, one of them the
// default that bills the instances holding the version on a subscription of that period. A
// price is created and deprecated, never edited. Extra seats has a monthly and an annual
// default on its first version, which an instance holds, and a monthly one on its draft;
// Extra tokens has a monthly price and a metered one the console does not list.

const PRICE_WRITES = /^\/api\/addons\/[^/]+\/prices(\/[^/]+(\/deprecate)?)?$/;

test.describe('the prices of a version', () => {
  test('say, for each usual period, which price bills it, and a missing annual price before a customer meets the refusal', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);

    await prices.goto('extra-seats-v2', 'Extra seats');

    await expect(prices.slot('MONTHLY')).toHaveAttribute(
      'data-status',
      'default',
    );
    await expect(prices.slot('MONTHLY')).toContainText('$12.00');
    await expect(prices.slot('ANNUAL')).toHaveAttribute(
      'data-status',
      'missing',
    );
    await expect(prices.slot('ANNUAL')).toContainText(
      'cannot be attached to a subscription with annual billing',
    );
    await expect(prices.rows()).toHaveCount(1);
    await expect(prices.row('Extra seat, monthly')).toContainText('Default');
    await expect(prices.row('Extra seat, monthly')).toContainText(
      'Monthly · In advance',
    );
    await expect(prices.row('Extra seat, monthly')).toContainText('Active');
  });

  test('have both slots filled on a version that sells monthly and annually', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);

    await prices.goto('extra-seats-v1', 'Extra seats');

    await expect(prices.slot('MONTHLY')).toHaveAttribute(
      'data-status',
      'default',
    );
    await expect(prices.slot('ANNUAL')).toHaveAttribute(
      'data-status',
      'default',
    );
    await expect(prices.slot('ANNUAL')).toContainText('$100.00');
    await expect(prices.rows()).toHaveCount(2);
  });

  test('leave out the metered prices the API keeps and never values, and say how many there are', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);

    await prices.goto('extra-tokens-v1', 'Extra tokens');

    await expect(prices.rows()).toHaveCount(1);
    await expect(prices.row('Extra tokens, monthly')).toBeVisible();
    await expect(page.getByText('Tokens, metered')).toHaveCount(0);
    await expect(page.getByTestId('unvalued-prices')).toHaveText(
      'This version also has 1 metered price, which billing does not value: it is not listed.',
    );
  });

  test('need none on a version sold on request, which has no slot', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);

    await page.goto('/addons/priority-support-v2/prices');

    await expect(
      page.getByText('This version has no price yet.'),
    ).toBeVisible();
    await expect(prices.slots()).toHaveCount(0);
  });

  test('say what a version that was withdrawn does with its prices, and offer a new version in place of one', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);

    await page.goto('/addons/priority-support-v1/prices');

    await expect(page.getByText('takes no new price')).toBeVisible();
    await expect(prices.addPrice()).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'New Version' }),
    ).toHaveAttribute('href', '/addons/new?family=priority-support');
  });
});

test.describe('adding a price', () => {
  test('sends a flat fee as the API takes it, in the currency of the version, and shows its slot without a reload', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    const writes = recordWrites(page, PRICE_WRITES);
    await installAddonsWorld(page);
    await prices.goto('extra-seats-v2', 'Extra seats');

    await prices.addPrice().click();
    await expect(page).toHaveURL('/addons/extra-seats-v2/prices?price=new');
    await expect(prices.drawer()).toBeVisible();
    // A version bills in one currency, fixed by its first price.
    await expect(prices.lockedCurrency()).toBeDisabled();
    await expect(prices.lockedCurrency()).toHaveValue('USD');
    // Monthly has its default, so the next price is not one unless it is made to be.
    await expect(prices.defaultCheckbox()).not.toBeChecked();
    // Annual has none: the price that fills it is its default.
    await prices.choosePeriod('Annual');
    await expect(prices.defaultCheckbox()).toBeChecked();
    await prices.amountField().fill('120.00');
    await prices.labelField().fill('Extra seat, annual');
    await expect(prices.livePreview()).toContainText('$120.00');
    await prices.createButton().click();

    await expectToast(page, 'Price created');
    await expect(prices.drawer()).toHaveCount(0);
    await expect(page).toHaveURL('/addons/extra-seats-v2/prices');
    await expect(prices.slot('ANNUAL')).toHaveAttribute(
      'data-status',
      'default',
    );
    await expect(prices.slot('ANNUAL')).toContainText('$120.00');
    await expect(prices.row('Extra seat, annual')).toContainText(
      'Annual · In advance',
    );
    // 120.00 typed, 12000 sent: the amount goes out in minor units, as a string, and
    // the price takes the place after the last one of the version.
    expect(writes).toEqual([
      {
        body: {
          billingModel: 'FLAT_FEE',
          billingPeriod: 'ANNUAL',
          billingTiming: 'ADVANCE',
          currency: 'USD',
          displayLabel: 'Extra seat, annual',
          displayOrder: 2,
          isDefault: true,
          unitAmountDecimal: '12000',
        },
        method: 'POST',
        pathname: '/api/addons/extra-seats-v2/prices',
      },
    ]);
  });

  test('lets the first price of a version choose its currency, which every next price keeps', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    const writes = recordWrites(page, PRICE_WRITES);
    await installAddonsWorld(page);
    // Sold on request, the version has no slot to show.
    await page.goto('/addons/priority-support-v2/prices');
    await expect(prices.addPrice()).toBeVisible();

    await prices.addPrice().click();
    await expect(prices.currencyField().getByRole('button')).toHaveText('USD');
    await prices.chooseCurrency('EUR');
    await prices.amountField().fill('50');
    await prices.createButton().click();

    await expectToast(page, 'Price created');
    // The first price of the version fixes its currency, and fills no display order.
    expect(writes[0]?.body).toMatchObject({
      currency: 'EUR',
      unitAmountDecimal: '5000',
    });
    expect(writes[0]?.body).not.toHaveProperty('displayOrder');

    await prices.addPrice().click();
    await expect(prices.lockedCurrency()).toBeDisabled();
    await expect(prices.lockedCurrency()).toHaveValue('EUR');
  });

  test('refuses an amount that is not one, before anything is sent', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    const writes = recordWrites(page, PRICE_WRITES);
    await installAddonsWorld(page);
    await prices.goto('extra-seats-v2', 'Extra seats');

    await prices.addPrice().click();
    await prices.amountField().fill('abc');
    await prices.amountField().blur();

    await expect(
      prices
        .drawer()
        .getByText(
          /Enter a valid amount: zero or more, with at most 12 decimals/,
        ),
    ).toBeVisible();
    await expect(prices.createButton()).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('asks before a price takes the place of the default of its period, and names the price it replaces', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    const writes = recordWrites(page, PRICE_WRITES);
    await installAddonsWorld(page);
    await prices.goto('extra-seats-v2', 'Extra seats');

    await prices.addPrice().click();
    await prices.amountField().fill('15.00');
    await prices.labelField().fill('Extra seat, monthly (2028)');
    await prices.defaultCheckbox().check();
    await prices.createButton().click();

    await expect(prices.confirmation()).toContainText(
      'Replace the default monthly price?',
    );
    await expect(prices.confirmation()).toContainText('Extra seat, monthly');
    await expect(prices.confirmation()).toContainText('$12.00');
    // Saying no leaves the form as it was typed, and sends nothing.
    await prices.confirmation().getByRole('button', { name: 'Cancel' }).click();
    await expect(prices.confirmation()).toHaveCount(0);
    await expect(prices.amountField()).toHaveValue('15.00');
    expect(writes).toEqual([]);

    await prices.createButton().click();
    await prices.confirm('Replace the default');

    await expectToast(page, 'Price created');
    await expect(prices.slot('MONTHLY')).toContainText('$15.00');
    // The old price stays listed and active; it is simply no longer the default.
    await expect(prices.row('Extra seat, monthly')).toContainText('Active');
    await expect(prices.row('Extra seat, monthly (2028)')).toContainText(
      'Default',
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toMatchObject({
      isDefault: true,
      unitAmountDecimal: '1500',
    });
  });

  test('asks nothing when the new price is not made the default', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);
    await prices.goto('extra-seats-v2', 'Extra seats');

    await prices.addPrice().click();
    await prices.amountField().fill('11.00');
    await prices.labelField().fill('Extra seat, promo');
    await prices.createButton().click();

    await expectToast(page, 'Price created');
    await expect(prices.confirmation()).toHaveCount(0);
    await expect(prices.slot('MONTHLY')).toContainText('$12.00');
    await expect(prices.row('Extra seat, promo')).not.toContainText('Default');
  });

  test('shows the currency refusal of the API on the drawer, which keeps what was typed', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    const model = createAddonsBillingModel();
    model.addons.armProblem('createAddonPrice', {
      code: 'CreateAddonPrice.CurrencyMismatch',
      detail:
        'this add-on version already has prices in another currency: one currency per version',
      status: 422,
    });
    await installAddonsWorld(page, model);
    await prices.goto('extra-seats-v2', 'Extra seats');

    await prices.addPrice().click();
    await prices.amountField().fill('13.00');
    await prices.createButton().click();

    await expect(
      prices
        .drawer()
        .getByText(
          'this add-on version already has prices in another currency: one currency per version',
        ),
    ).toBeVisible();
    await expect(prices.amountField()).toHaveValue('13.00');
    await expectNoToast(page);
  });

  test('closes with Cancel, and leaves the tab as it was', async ({ page }) => {
    const prices = new AddonPricesDriver(page);
    const writes = recordWrites(page, PRICE_WRITES);
    await installAddonsWorld(page);
    await prices.goto('extra-seats-v2', 'Extra seats');

    await prices.addPrice().click();
    await prices.drawer().getByRole('button', { name: 'Cancel' }).click();

    await expect(prices.drawer()).toHaveCount(0);
    await expect(page).toHaveURL('/addons/extra-seats-v2/prices');
    expect(writes).toEqual([]);
  });

  test('opens from a link, and drops a link that cannot open one', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);

    await page.goto('/addons/extra-seats-v2/prices?price=new');
    await expect(prices.drawer()).toBeVisible();

    // A price is never edited, and a withdrawn version takes none.
    await page.goto(
      '/addons/extra-seats-v2/prices?price=price-seats-v2-monthly',
    );
    await expect(page).toHaveURL('/addons/extra-seats-v2/prices');
    await page.goto('/addons/priority-support-v1/prices?price=new');
    await expect(page).toHaveURL('/addons/priority-support-v1/prices');
    await expect(prices.drawer()).toHaveCount(0);
  });
});

test.describe('deprecating a price', () => {
  test('asks first, says what it does and what it does not, and keeps the price listed as deprecated', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    const writes = recordWrites(page, PRICE_WRITES);
    await installAddonsWorld(page);
    await prices.goto('extra-seats-v2', 'Extra seats');
    // A version has one default a period: the one to retire is another.
    await prices.addPrice().click();
    await prices.amountField().fill('11.00');
    await prices.labelField().fill('Extra seat, promo');
    await prices.createButton().click();
    await expectToast(page, 'Price created');
    writes.length = 0;

    await prices.deprecateButton('Extra seat, promo').click();
    await expect(prices.confirmation()).toContainText(
      'Deprecate “Extra seat, promo”?',
    );
    await expect(prices.confirmation()).toContainText(
      'Instances already billed from this price keep being billed from it.',
    );
    await prices.confirm('Deprecate');

    await expectToast(page, 'Price deprecated');
    await expect(prices.row('Extra seat, promo')).toContainText('Deprecated');
    // Nothing more to do to a price that is retired.
    await expect(prices.deprecateButton('Extra seat, promo')).toHaveCount(0);
    expect(writes).toEqual([
      {
        body: null,
        method: 'POST',
        pathname: expect.stringMatching(
          /^\/api\/addons\/extra-seats-v2\/prices\/[^/]+\/deprecate$/,
        ),
      },
    ]);
  });

  test('withholds the default of a period, and says how to change it instead', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);
    await prices.goto('extra-seats-v2', 'Extra seats');

    const deprecate = prices.deprecateButton('Extra seat, monthly');
    await expect(deprecate).toHaveAttribute('aria-disabled', 'true');
    await deprecate.hover();
    await expect(page.getByRole('tooltip')).toContainText(
      'The default price of a period bills every instance that holds this version.',
    );
    await deprecate.click({ force: true });
    await expect(prices.confirmation()).toHaveCount(0);
  });

  test('keeps the price, and says why, in the words of the API', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    const model = createAddonsBillingModel();
    model.addons.armProblem('deprecateAddonPrice', {
      code: 'DeprecateAddonPrice.AlreadyDeprecated',
      detail: 'the price is already deprecated',
      status: 409,
    });
    await installAddonsWorld(page, model);
    await prices.goto('extra-seats-v2', 'Extra seats');
    await prices.addPrice().click();
    await prices.amountField().fill('11.00');
    await prices.labelField().fill('Extra seat, promo');
    await prices.createButton().click();
    await expectToast(page, 'Price created');

    await prices.deprecateButton('Extra seat, promo').click();
    await prices.confirm('Deprecate');

    // The dialog stays open on the words of the API, with the way to ask again.
    await expect(prices.confirmation()).toContainText(
      'the price is already deprecated',
    );
    await prices.confirmation().getByRole('button', { name: 'Cancel' }).click();
    await expect(prices.row('Extra seat, promo')).not.toContainText(
      'Deprecated',
    );
  });
});

test.describe('a version an instance with a live subscription holds', () => {
  test('refuses a new price with a dialog that says what the API said, and leads to a new version', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    const freeze = new AddonFreezeDriver(page);
    await installAddonsWorld(page);
    await prices.goto('extra-seats-v1', 'Extra seats');

    await prices.addPrice().click();
    await prices.choosePeriod('Quarterly');
    await prices.amountField().fill('28.00');
    await prices.createButton().click();

    await freeze.expectTitle('This version is held by a billed instance');
    await expect(freeze.detail()).toContainText('what it sells is frozen');
    await expect(freeze.createNewVersion()).toHaveAttribute(
      'href',
      '/addons/new?family=extra-seats',
    );
    // A dialog, not a toast.
    await expectNoToast(page);
  });

  test('can still be told how to change what it sells: the note leads to a new version', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    await installAddonsWorld(page);

    await prices.goto('extra-seats-v1', 'Extra seats');

    await expect(
      page.getByText('A price can still be added until an instance'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'New Version' }),
    ).toHaveAttribute('href', '/addons/new?family=extra-seats');
  });
});
