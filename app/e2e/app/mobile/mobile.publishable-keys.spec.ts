import { devices } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectNoHorizontalScroll,
  expectOnScreen,
  expectScrollsInside,
} from '../_support/assertions/layout';
import { PublishableKeysDriver } from '../_support/drivers/publishable-keys.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createPublishableKeysBillingModel } from '../integrations/integrations.scenarios';

// The publishable keys on the narrowest phone the billing screens are checked at: the page
// keeps the width of the screen, a table too wide for it scrolls inside its card, and each
// dialog fits it with its fields, its buttons and the key shown once within reach.

const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

test.beforeEach(async ({ page }) => {
  await installBillingAppMocks(page, createPublishableKeysBillingModel());
});

test.describe('the list of publishable keys, on the narrowest phone', () => {
  test('keeps the width of the screen, its table scrolling inside its card', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);

    await keys.goto();
    await expect(keys.rows().first()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(page.getByRole('table'));
    await expectOnScreen(page, keys.searchField());
    await expectOnScreen(page, keys.includeRevoked());
    await expectOnScreen(page, keys.newKey());
    await expectOnScreen(page, keys.intro());
  });

  test('keeps it with the revoked keys listed', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);

    await keys.goto('?includeRevoked=true');
    await expect(keys.row('Legacy checkout')).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
  });
});

test.describe('the dialogs of the publishable keys, on the narrowest phone', () => {
  test('the form that issues a key fits the screen, with its buttons within reach', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.newKey().click();
    await keys.fill({
      label: 'Checkout',
      origins: ['http://shop.acme.test', 'https://store.acme.test'],
    });
    await keys.originsField().press('Tab');
    await expect(keys.rejectedOrigins()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectOnScreen(page, keys.dialog());
    await expectOnScreen(page, keys.labelField());
    await expectOnScreen(page, keys.originsField());
    await expectOnScreen(page, keys.rejectedOrigins());
    await keys.createButton().scrollIntoViewIfNeeded();
    await expectOnScreen(page, keys.createButton());
  });

  test('the key shown once fits the screen, readable and copiable', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.newKey().click();
    await keys.fill({ label: 'Checkout' });
    await keys.createButton().click();
    await expect(keys.createdKey()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectOnScreen(page, keys.createdKey());
    await expectOnScreen(page, keys.copyKey());
    await expectOnScreen(page, keys.done());
  });

  test('the confirmation that revokes a key fits the screen', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await keys.goto();
    await keys.revokeButton('pricing').scrollIntoViewIfNeeded();
    await keys.revokeButton('pricing').click();
    await expect(keys.confirmation()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectOnScreen(page, keys.confirmation());
    await expectOnScreen(page, keys.confirmRevoke());
  });
});
