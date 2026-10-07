import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { LicensePriceDrawerDriver } from '../_support/drivers/license-price-drawer.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingStackModel } from '../billing/billing.scenarios';
import {
  createDraftPricesModel,
  createPricedCatalogModel,
} from './licenses.scenarios';

// Adding a price to a license version, in the drawer the URL opens: a price of
// each shape, what the picker offers, what is sent and what the API refuses.

const PRICE_WRITES = /^\/api\/licenses\/[^/]+\/prices(\/[^/]+)?$/;

test.describe('adding a price', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('sends a flat fee as the API takes it, and shows its row without a reload', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.expectOpen('New price');
    // The drawer is in the URL, so that it can be linked to.
    await expect(page).toHaveURL('/licenses/pro-v4/prices?price=new');

    // A flat fee, monthly, in advance, in the default currency: the first price
    // of a version is the default of its period.
    await expect(drawer.model('Flat fee')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(drawer.isDefault()).toBeChecked();
    await expect(drawer.submit('Create price')).toBeDisabled();

    await drawer.amount().fill('49.00');
    await drawer.label().fill('Pro monthly');
    // The price is read back the way the table will read it.
    await expect(drawer.livePreview()).toHaveText('Reads as $49.00/month');
    await drawer.submit('Create price').click();

    await expectToast(page, 'Price created');
    await drawer.expectClosed();
    await expect(page).toHaveURL('/licenses/pro-v4/prices');
    await prices.expectLabels(['Pro monthly']);
    await expect(prices.row('Pro monthly').getByText('$49.00')).toBeVisible();
    await expect(prices.row('Pro monthly').getByText('Default')).toBeVisible();
    // 49.00 typed, 4900 sent: the amount goes out in minor units, as a string.
    expect(writes).toEqual([
      {
        body: {
          billingModel: 'FLAT_FEE',
          billingPeriod: 'MONTHLY',
          billingTiming: 'ADVANCE',
          currency: 'USD',
          displayLabel: 'Pro monthly',
          isDefault: true,
          unitAmountDecimal: '4900',
        },
        method: 'POST',
        pathname: '/api/licenses/pro-v4/prices',
      },
    ]);
  });

  test('takes the currency of the version once it has a price, and puts the next price after the last', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createDraftPricesModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.expectOpen('New price');

    // One currency per version, fixed by its first price.
    await expect(
      drawer.currency().getByRole('textbox', { name: 'Currency' }),
    ).toBeDisabled();
    await expect(drawer.currency()).toContainText(
      'This version bills in USD, fixed by its first price.',
    );
    // The monthly default exists already.
    await expect(drawer.isDefault()).not.toBeChecked();

    await drawer.choosePeriod('Annual');
    await drawer.amount().fill('390');
    await drawer.submit('Create price').click();

    await expectToast(page, 'Price created');
    expect(writes).toEqual([
      {
        body: {
          billingModel: 'FLAT_FEE',
          billingPeriod: 'ANNUAL',
          billingTiming: 'ADVANCE',
          currency: 'USD',
          // After the last of the two prices the draft has.
          displayOrder: 3,
          isDefault: false,
          unitAmountDecimal: '39000',
        },
        method: 'POST',
        pathname: '/api/licenses/pro-v4/prices',
      },
    ]);
    // No label given: the line is named after its shape until the API derives one.
    await prices.expectLabels(['Pro, monthly', 'Requests', 'Flat fee']);
  });

  test('refuses an amount that is not one, before anything is sent', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();

    await drawer.amount().fill('-5');
    await drawer.amount().blur();

    await expect(
      drawer.root().getByText(/Enter a valid amount: zero or more/),
    ).toBeVisible();
    await expect(drawer.submit('Create price')).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('offers the flows the version grants, the stocks disabled, and nothing else', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.chooseModel('Usage-based');

    // The version grants traces, requests, seats, latency, credits, sso and
    // theme: a flow is metered, a stock is listed to say why it is not, and an
    // average, a flag and a configuration cannot be rated at all.
    expect(await drawer.meterOptions()).toEqual([
      'Credits',
      'Requests',
      'Traces',
      'Seats',
    ]);
    for (const flow of ['Credits', 'Requests', 'Traces']) {
      await expect(drawer.meterOption(flow)).toBeEnabled();
    }
    await expect(drawer.meterOption('Traces')).toContainText(
      'Summed, resets every month',
    );
    await expect(drawer.meterOption('Requests')).toContainText(
      'Counted, resets every day',
    );
    await expect(drawer.meterOption('Seats')).toBeDisabled();
    await expect(drawer.meterOption('Seats')).toContainText(
      'it never resets, so it cannot be metered',
    );
    // Add-ons are not part of the console yet: the hint says where a stock is
    // sold, and links nowhere.
    await expect(drawer.stockHint()).toContainText('sold as an add-on');
    await expect(drawer.picker().getByRole('link')).toHaveCount(0);

    // Usage cannot be billed before it happens, and a metered price has no
    // period of its own.
    await expect(drawer.timing('In arrears')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(drawer.timing('In arrears')).toBeDisabled();
    await expect(drawer.timing('In advance')).toBeDisabled();
    await expect(drawer.root()).toContainText(
      'A metered price is always billed in arrears',
    );
    await expect(drawer.period()).toHaveCount(0);
  });

  test('sends a usage price for the entitlement it meters, per the unit it is sold in', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.chooseModel('Usage-based');
    await drawer.chooseMeter('Requests');

    // The amount is per the sale unit the entitlement is sold in.
    await expect(
      drawer.root().getByRole('textbox', { name: /^Amount per 1k requests/ }),
    ).toBeVisible();
    await drawer.amount().fill('0.075');
    await expect(drawer.livePreview()).toHaveText(
      'Reads as $0.075 per 1k requests',
    );
    await drawer.submit('Create price').click();

    await expectToast(page, 'Price created');
    await prices.expectLabels(['Requests']);
    expect(writes).toEqual([
      {
        body: {
          billingModel: 'USAGE_BASED',
          billingTiming: 'ARREARS',
          currency: 'USD',
          meteredEntitlementSlug: 'requests',
          // 7.5 cents: no decimal of a price per unit is lost.
          unitAmountDecimal: '7.5',
        },
        method: 'POST',
        pathname: '/api/licenses/pro-v4/prices',
      },
    ]);
  });

  test('states the allowance and the cap an overage bills against, and refuses it where it cannot occur', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.chooseModel('Overage');

    // Traces: 100,000 at 100 %, so 200,000 is the most the gate accepts.
    await expect(drawer.meterOption('Traces')).toBeEnabled();
    await expect(drawer.meterOption('Traces')).toContainText(
      'Bills above 100,000 traces/month, up to 200,000',
    );
    // A hard limit (requests) and an unlimited grant (credits) never exceed.
    for (const name of ['Requests', 'Credits']) {
      await expect(drawer.meterOption(name)).toBeDisabled();
      await expect(drawer.meterOption(name)).toContainText(
        'Overage cannot occur on this grant',
      );
    }

    await drawer.chooseMeter('Traces');
    await drawer.amount().fill('8.00');
    await expect(drawer.livePreview()).toHaveText(
      'Reads as $8.00 per 100,000 traces',
    );
    await drawer.submit('Create price').click();

    await expectToast(page, 'Price created');
    await expect(
      prices.row('Traces').getByText('Bills above 100,000 traces/month'),
    ).toBeVisible();
    expect(writes).toEqual([
      {
        body: {
          billingModel: 'OVERAGE',
          billingTiming: 'ARREARS',
          currency: 'USD',
          meteredEntitlementSlug: 'traces',
          unitAmountDecimal: '800',
        },
        method: 'POST',
        pathname: '/api/licenses/pro-v4/prices',
      },
    ]);
  });

  test('sends nothing of the shape it was switched from', async ({ page }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.chooseModel('Usage-based');
    await drawer.chooseMeter('Traces');
    await drawer.chooseModel('Flat fee');

    // Back to a flat fee: the meter is gone, the period and the timing are back.
    await expect(drawer.picker()).toHaveCount(0);
    await expect(drawer.period()).toBeVisible();
    await expect(drawer.timing('In advance')).toBeEnabled();
    await expect(drawer.timing('In advance')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await drawer.amount().fill('29');
    await drawer.submit('Create price').click();

    await expectToast(page, 'Price created');
    expect(writes.map(({ body }) => body)).toEqual([
      {
        billingModel: 'FLAT_FEE',
        billingPeriod: 'MONTHLY',
        billingTiming: 'ADVANCE',
        currency: 'USD',
        isDefault: true,
        unitAmountDecimal: '2900',
      },
    ]);
  });

  test('shows the refusal of the API under the form, which keeps what was typed', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    const model = createDraftPricesModel();
    model.setNextProblem('createPrice', {
      code: 'CreateLicensePrice.DefaultConflict',
      detail: 'another price is already the default for this billing period',
      status: 409,
    });
    await installLicenseAppMocks(page, model);
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.amount().fill('49');
    await drawer.isDefault().check();
    await drawer.submit('Create price').click();

    await expect(drawer.problem()).toContainText(
      'another price is already the default for this billing period',
    );
    // Nothing was lost: the drawer is open, as it was typed.
    await drawer.expectOpen('New price');
    await expect(drawer.amount()).toHaveValue('49');
    await expect(drawer.isDefault()).toBeChecked();

    // Without the default, the same form goes through.
    await drawer.isDefault().uncheck();
    await drawer.submit('Create price').click();
    await expectToast(page, 'Price created');
    // The refused call created nothing: one price was added to the two.
    await prices.expectLabels(['Pro, monthly', 'Requests', 'Flat fee']);
    expect(writes).toHaveLength(2);
  });

  test('closes with Cancel, and leaves the tab as it was', async ({ page }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createDraftPricesModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.amount().fill('12');
    await drawer.cancel().click();

    await drawer.expectClosed();
    await expect(page).toHaveURL('/licenses/pro-v4/prices');
    await prices.expectLabels(['Pro, monthly', 'Requests']);
    expect(writes).toEqual([]);
  });

  test('is a place in the history: the back button closes the drawer', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createDraftPricesModel());

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.expectOpen('New price');

    await page.goBack();

    await drawer.expectClosed();
    await expect(page).toHaveURL('/licenses/pro-v4/prices');
  });

  test('opens from a link, and drops a link that cannot open one', async ({
    page,
  }) => {
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await page.goto('/licenses/pro-v4/prices?price=new');
    await drawer.expectOpen('New price');

    // A price the version does not have.
    await page.goto('/licenses/pro-v4/prices?price=nope');
    await expect(page).toHaveURL('/licenses/pro-v4/prices');
    await drawer.expectClosed();

    // A published version's prices are immutable: no drawer to edit one in.
    await page.goto('/licenses/pro-v2/prices?price=price-1-base');
    await expect(page).toHaveURL('/licenses/pro-v2/prices');
    await drawer.expectClosed();
  });

  test('is not offered on an archived version, which takes no price', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro', 'Pro');

    await expect(prices.addPrice()).toHaveCount(0);
  });

  test('is still offered on a published version, until a subscription bills it', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');

    await expect(prices.addPrice()).toBeVisible();
  });
});
