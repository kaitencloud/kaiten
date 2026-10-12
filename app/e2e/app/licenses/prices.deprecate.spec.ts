import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingStackModel } from '../billing/billing.scenarios';
import { createPricedCatalogModel } from './licenses.scenarios';

// Deprecating a price of a license version, which asks first and cannot be
// undone.

const DEPRECATIONS = /^\/api\/licenses\/[^/]+\/prices\/[^/]+\/deprecate$/;

test.describe('deprecating a price', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('asks first, then retires a metered price from the next invoice', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, DEPRECATIONS);

    await prices.goto('pro-v2', 'Pro');
    await prices.deprecate('Traces, overage').click();

    const dialog = prices.deprecateDialog();
    await expect(dialog).toContainText('Deprecate “Traces, overage”?');
    await expect(dialog).toContainText(
      'produces no line from the next invoice on',
    );
    await expect(dialog).toContainText('This cannot be undone');
    // Not the default of its period: nothing else changes with it.
    await expect(dialog).not.toContainText('default flag');
    // Asking is not deprecating.
    expect(writes).toEqual([]);

    await prices.confirmDeprecation();

    await expectToast(page, 'Price deprecated');
    await expect(prices.deprecateDialog()).toHaveCount(0);
    await expect(prices.status('Traces, overage')).toHaveText('Deprecated');
    await expect(prices.deprecate('Traces, overage')).toHaveCount(0);
    expect(writes).toEqual([
      {
        body: null,
        method: 'POST',
        pathname: '/api/licenses/pro-v2/prices/price-2-over/deprecate',
      },
    ]);
  });

  test('says what retiring the default price changes: its flag goes with it, pinned subscriptions stay', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await expect(prices.row('Pro, monthly').getByText('Default')).toBeVisible();
    await prices.deprecate('Pro, monthly').click();

    const dialog = prices.deprecateDialog();
    await expect(dialog).toContainText(
      'Subscriptions already pinned to this price keep being billed from it',
    );
    await expect(dialog).toContainText(
      'no longer offered to new subscriptions, nor as the target of a plan change',
    );
    await expect(dialog).toContainText(
      'clears the default flag in the same write',
    );

    await prices.confirmDeprecation();

    await expectToast(page, 'Price deprecated');
    await expect(prices.status('Pro, monthly')).toHaveText('Deprecated');
    // The API cleared the flag in the same write: no default is left on it.
    await expect(prices.row('Pro, monthly').getByText('Default')).toHaveCount(
      0,
    );
  });

  test('changes nothing when the confirmation is cancelled', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, DEPRECATIONS);

    await prices.goto('pro-v2', 'Pro');
    await prices.deprecate('Pro, monthly').click();
    await prices
      .deprecateDialog()
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();

    await expect(prices.deprecateDialog()).toHaveCount(0);
    await expect(prices.status('Pro, monthly')).toHaveText('Active');
    expect(writes).toEqual([]);
  });

  test('shows the reason the API gives, in the dialog, which stays open', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const model = createPricedCatalogModel();
    model.setNextProblem('deprecatePrice', {
      code: 'DeprecateLicensePrice.PlanChangeTarget',
      detail: 'this price is the target of a scheduled plan change',
      status: 409,
    });
    await installLicenseAppMocks(page, model);

    await prices.goto('pro-v2', 'Pro');
    await prices.deprecate('Pro, monthly').click();
    await prices.confirmDeprecation();

    await expect(prices.deprecateDialog()).toContainText(
      'this price is the target of a scheduled plan change',
    );

    // The refusal was the one armed: asking again goes through, from the same
    // dialog, which did not close.
    await prices.confirmDeprecation();
    await expectToast(page, 'Price deprecated');
    await expect(prices.deprecateDialog()).toHaveCount(0);
    await expect(prices.status('Pro, monthly')).toHaveText('Deprecated');
  });
});
