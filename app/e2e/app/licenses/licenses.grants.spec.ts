import { expect, expectToast, test } from '../_support/app-test';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingStackModel } from '../billing/billing.scenarios';
import { createDraftPricesModel } from './licenses.scenarios';

// The grants of a version, which the prices it bills hold in place: the API
// refuses to remove an entitlement an active price meters, on a draft as on a
// published version, and says why.

test.describe('a grant an active price meters', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createDraftPricesModel());
  });

  test('is kept, with the reason the API gives, until the price is deprecated', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const prices = new LicensePricesDriver(page);

    await detail.goto('pro-v4', 'Pro');
    // The usage price of the draft meters requests.
    await detail.removeGrant('Requests');

    // The reason, not a line that says nothing, and no dialog: it is not a
    // version that cannot be changed, it is a grant that has a price.
    await expectToast(
      page,
      'an active price of this licence version meters this entitlement: deprecate the price before removing the grant',
    );
    await expect(detail.grantRow('Requests')).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // What it asks is done on the prices, and the grant then goes.
    await prices.tab('Prices').click();
    await prices.deprecate('Requests').click();
    await prices.confirmDeprecation();
    await expectToast(page, 'Price deprecated');

    await prices.tab('Overview').click();
    await detail.removeGrant('Requests');
    await expectToast(page, 'Entitlement removed successfully');
    await expect(detail.grantRow('Requests')).toHaveCount(0);
  });
});
