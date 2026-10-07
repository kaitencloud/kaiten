import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import {
  expectNoHorizontalScroll,
  expectScrollsInside,
} from '../_support/assertions/layout';
import { LicenseCommercialDriver } from '../_support/drivers/license-commercial.driver';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicensePreviewDriver } from '../_support/drivers/license-preview.driver';
import { LicensePriceDrawerDriver } from '../_support/drivers/license-price-drawer.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingStackModel } from '../billing/billing.scenarios';
import { createPricedCatalogModel } from '../licenses/licenses.scenarios';

// The narrowest phone billing is checked at: narrower than the Pixel 5, which
// the rest of the mobile suite uses.
const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

/** The dialog is wholly on the screen: neither of its sides is cut off. */
async function expectWithinScreen(dialog: Locator) {
  const box = await dialog.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
}

test.describe('what a license version sells, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createPricedCatalogModel());
  });

  test('the Prices tab keeps the width of the screen, its table scrolling inside its card', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);

    await prices.goto('pro-v2', 'Pro');
    await prices.expectLabels([
      'Pro, monthly',
      'Pro, annual',
      'Traces, overage',
    ]);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(page.getByRole('table'));
    // What a row offers is still there, at the end of the row it belongs to.
    await expect(prices.deprecate('Traces, overage')).toBeAttached();
  });

  test('the overview, with its commercial terms and their dialog, fits the screen', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);

    await detail.goto('pro-v4', 'Pro');
    await expect(commercial.card()).toBeVisible();
    await expectNoHorizontalScroll(page, WIDTH);

    await commercial.open();
    await expectWithinScreen(commercial.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the drawer of a price fits the screen, with the picker of what it meters', async ({
    page,
  }) => {
    const drawer = new LicensePriceDrawerDriver(page);

    await page.goto('/licenses/pro-v4/prices?price=new');
    await drawer.expectOpen('New price');
    await drawer.chooseModel('Overage');
    await expect(drawer.picker()).toBeVisible();

    await expectWithinScreen(drawer.root());
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the preview of an invoice fits the screen, its lines scrolling inside the dialog', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    await preview.sample('Traces').fill('172345');
    await preview.run().click();
    await expect(preview.result()).toBeVisible();

    await expectWithinScreen(preview.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(preview.result().getByRole('table'));
  });
});
