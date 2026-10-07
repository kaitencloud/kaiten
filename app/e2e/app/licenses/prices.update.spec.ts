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

// Editing a price of a license version: only the prices of a draft change.

const PRICE_WRITES = /^\/api\/licenses\/[^/]+\/prices(\/[^/]+)?$/;

test.describe('editing a price', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('changes what a draft price charges, and clears its label with the empty string', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createDraftPricesModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.edit('Pro, monthly').click();
    await drawer.expectOpen('Edit price');
    await expect(page).toHaveURL('/licenses/pro-v4/prices?price=price-1-base');

    // The price as it is, its amount in major units.
    await expect(drawer.amount()).toHaveValue('39.00');
    await expect(drawer.label()).toHaveValue('Pro, monthly');
    await expect(drawer.isDefault()).toBeChecked();
    // What the API does not let an update touch stays put: the shape and the
    // currency.
    await expect(drawer.model('Flat fee')).toBeDisabled();
    await expect(drawer.model('Overage')).toBeDisabled();
    await expect(drawer.root()).toContainText(
      'The shape of a price cannot change once it exists',
    );
    await expect(drawer.submit('Save price')).toBeDisabled();

    await drawer.amount().fill('42.50');
    await drawer.label().fill('');
    await drawer.submit('Save price').click();

    await expectToast(page, 'Price updated');
    await drawer.expectClosed();
    // With no label of its own the line is named after its shape.
    await prices.expectLabels(['Flat fee', 'Requests']);
    await expect(prices.row('Flat fee').getByText('$42.50')).toBeVisible();
    expect(writes).toEqual([
      {
        body: {
          billingPeriod: 'MONTHLY',
          billingTiming: 'ADVANCE',
          // Left out would keep the label: the empty string clears it.
          displayLabel: '',
          isDefault: true,
          unitAmountDecimal: '4250',
        },
        method: 'PATCH',
        pathname: '/api/licenses/pro-v4/prices/price-1-base',
      },
    ]);
  });

  test('re-points a usage price at another entitlement, which then is the one offered', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createDraftPricesModel());
    const writes = recordWrites(page, PRICE_WRITES);

    await prices.goto('pro-v4', 'Pro');
    await prices.edit('Requests').click();
    await drawer.expectOpen('Edit price');

    // The entitlement the price meters is still offered, picked: no other
    // active price meters it.
    await expect(drawer.meterOption('Requests')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await drawer.chooseMeter('Traces');
    await drawer.submit('Save price').click();

    await expectToast(page, 'Price updated');
    expect(writes.map(({ body }) => body)).toEqual([
      {
        billingTiming: 'ARREARS',
        displayLabel: 'Requests',
        meteredEntitlementSlug: 'traces',
        unitAmountDecimal: '150',
      },
    ]);
  });

  test('offers nothing to edit on a published version, only to deprecate', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');

    await expect(page.getByRole('link', { name: /^Edit / })).toHaveCount(0);
    await expect(prices.deprecate('Pro, monthly')).toBeVisible();
    await expect(prices.deprecate('Traces, overage')).toBeVisible();
    // A deprecated price has nothing left to do to it.
    await expect(prices.deprecate('Pro, annual')).toHaveCount(0);
  });
});
