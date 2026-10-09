import { expect, test } from '../_support/app-test';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingDisabledModel } from '../billing/billing.scenarios';
import { createPricedCatalogModel } from './licenses.scenarios';

// The Prices tab of a license version where billing is not there: no tab, and
// an explanation on a deep link.

test.describe('where billing is not there', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    await installLicenseAppMocks(page, createPricedCatalogModel());
  });

  test('offers no Prices tab, and the version opens as it always did', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const prices = new LicensePricesDriver(page);

    await detail.goto('pro-v2', 'Pro');

    await detail.expectState('Published');
    // With nothing but its overview the version has no bar of tabs, as it had
    // none before it had a second one.
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(prices.tab('Prices')).toHaveCount(0);
  });

  test('explains on a deep link, and asks the API for nothing of billing but its capabilities', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (/^\/api\/licenses\/[^/]+\/(prices|invoice-preview)/.test(pathname)) {
        requests.push(`${request.method()} ${pathname}`);
      }
    });

    await page.goto('/catalog/licenses/pro-v2/prices');

    await expect(page.getByTestId('billing-unavailable')).toHaveAttribute(
      'data-reason',
      'DEPLOYMENT_DISABLED',
    );
    await expect(page.getByText(/KAITEN_BILLING_ENABLED/)).toBeVisible();
    // The page of the version is there around the explanation, and an
    // explanation is not an error.
    await expect(
      page.getByRole('heading', { name: 'Pro', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Page not found')).toHaveCount(0);
    expect(requests).toEqual([]);
  });
});
