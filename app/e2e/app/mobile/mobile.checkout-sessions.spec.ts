import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectNoHorizontalScroll,
  expectScrollsInside,
} from '../_support/assertions/layout';
import { CheckoutSessionsDriver } from '../_support/drivers/checkout-sessions.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import {
  CHECKOUT_NOW,
  createCheckoutSessionsBillingModel,
  createCheckoutSessionsCustomersModel,
} from '../customers/checkout-sessions.scenarios';

// The narrowest phone the billing screens are checked at: the page keeps the width of the
// screen, the table of checkouts scrolls inside its own container, and the panel of a
// checkout fits the screen with its amounts.
const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

/** The element is wholly on the screen: neither of its sides is cut off. */
async function expectWithinScreen(element: Locator) {
  const box = await element.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(CHECKOUT_NOW));
  await installCustomerAppMocks(page, createCheckoutSessionsCustomersModel());
  await installBillingAppMocks(page, createCheckoutSessionsBillingModel());
});

test.describe('the checkouts, on the narrowest phone', () => {
  test('the list keeps the width of the screen, and its table scrolls inside its container', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();
    await expect(checkouts.rows()).toHaveCount(6);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(page.getByRole('table').first());
    await expectWithinScreen(checkouts.searchField());
  });

  test('the panel of a checkout fits the screen, with what is due today', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-annual');
    await expect(checkouts.detail()).toBeVisible();
    // The panel slides in: it is measured once it has stopped.
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(checkouts.panel());
    await expectWithinScreen(page.getByTestId('checkout-session-due-today'));
    await expect(page.getByTestId('checkout-session-due-today')).toContainText(
      '€529.20',
    );
  });
});
