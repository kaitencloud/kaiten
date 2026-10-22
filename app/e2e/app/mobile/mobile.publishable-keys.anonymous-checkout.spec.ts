import { devices } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectNoHorizontalScroll,
  expectOnScreen,
} from '../_support/assertions/layout';
import { PublishableKeysDriver } from '../_support/drivers/publishable-keys.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createAnonymousCheckoutBillingModel } from '../integrations/integrations.scenarios';

// The anonymous checkout of a publishable key on the narrowest phone the billing screens
// are checked at: the list keeps the width of the screen with the badge of a key that
// opens it, and the form fits it with the switch, the site key, the secret and the
// buttons that act on a stored secret within reach.

const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

test.beforeEach(async ({ page }) => {
  await installBillingAppMocks(page, createAnonymousCheckoutBillingModel());
});

test.describe('the anonymous checkout of a publishable key, on the narrowest phone', () => {
  test('the list keeps the width of the screen with the badge of a key that opens it', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);

    await keys.goto();
    await expect(keys.anonymousBadge('Checkout page')).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the form of a key that opens it fits the screen, with the secret and its buttons within reach', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.editLink('Checkout page').scrollIntoViewIfNeeded();
    await keys.editLink('Checkout page').click();
    await expect(keys.anonymousCheckout()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await keys.anonymousCheckout().scrollIntoViewIfNeeded();
    await expectOnScreen(page, keys.anonymousCheckout());
    await keys.siteKeyField().scrollIntoViewIfNeeded();
    await expectOnScreen(page, keys.siteKeyField());
    await keys.replaceSecret().scrollIntoViewIfNeeded();
    await expectOnScreen(page, keys.replaceSecret());
    await expectOnScreen(page, keys.removeSecret());
    await keys.saveButton().scrollIntoViewIfNeeded();
    await expectOnScreen(page, keys.saveButton());
  });

  test('the form that types a secret fits the screen', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.newKey().click();
    await keys.siteKeyField().fill('1x00000000000000000000AA');
    await keys.secretField().fill('1x0000000000000000000000000000000AA');
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await keys.secretField().scrollIntoViewIfNeeded();
    await expectOnScreen(page, keys.secretField());
    await keys.createButton().scrollIntoViewIfNeeded();
    await expectOnScreen(page, keys.createButton());
  });
});
