import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectInside,
  expectNoHorizontalScroll,
  expectScrollsInside,
} from '../_support/assertions/layout';
import { AddonCompatibilityDriver } from '../_support/drivers/addon-compatibility.driver';
import { AddonDetailDriver } from '../_support/drivers/addon-detail.driver';
import { AddonGrantsDriver } from '../_support/drivers/addon-grants.driver';
import { AddonPricesDriver } from '../_support/drivers/addon-prices.driver';
import { AddonsListDriver } from '../_support/drivers/addons-list.driver';
import { InstanceAddonsDriver } from '../_support/drivers/instance-addons.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { installAddonsWorld } from '../addons/install-addons-world';

// The add-ons on the narrowest phone the billing screens are checked at: the pages keep the
// width of the screen, a table too wide for it scrolls inside its card, and each dialog and
// drawer fits it with its buttons within reach.

const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

/** The element is wholly on the screen: neither of its sides is cut off. */
async function expectWithinScreen(element: Locator) {
  const box = await element.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
}

test.describe('the catalogue of add-ons, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await installAddonsWorld(page);
  });

  test('the list keeps the width of the screen, with a family open', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);

    await list.goto();
    await list.expandFamily('Extra seats');

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(list.family('Extra seats'));
    await expectWithinScreen(list.publicSwitch('Extra seats'));
  });

  test('the versions of a family scroll inside their card, and what a row offers is still there', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);

    await list.goto();
    await list.expandFamily('Extra seats');

    await expectScrollsInside(list.family('Extra seats').getByRole('table'));
    await expect(list.action('Extra seats', '2027', 'Publish')).toBeAttached();
  });

  test('the dialog that makes an add-on fits the screen, with its buttons within reach', async ({
    page,
  }) => {
    await page.goto('/addons/new');
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'New add-on' }),
    ).toBeVisible();
    await settle(page);

    await expectWithinScreen(dialog);
    await expectNoHorizontalScroll(page, WIDTH);
    const create = dialog.getByRole('button', { name: 'Create add-on' });
    await create.scrollIntoViewIfNeeded();
    await expectWithinScreen(create);
  });

  test('the confirmation to publish fits the screen', async ({ page }) => {
    const list = new AddonsListDriver(page);
    const detail = new AddonDetailDriver(page);

    await list.goto();
    await list.expandFamily('Extra seats');
    await list.action('Extra seats', '2027', 'Publish').click();
    await expect(detail.confirmation()).toBeVisible();
    await settle(page);

    await expectWithinScreen(detail.confirmation());
    await expectNoHorizontalScroll(page, WIDTH);
  });
});

test.describe('a version of an add-on, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await installAddonsWorld(page);
  });

  test('the overview keeps the width of the screen, its actions wrapping inside the card', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);

    await detail.goto('extra-seats-v2', 'Extra seats');
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    for (const control of [
      detail.editLink(),
      detail.action('Delete'),
      detail.action('Publish'),
    ]) {
      await expectInside(detail.detailsCard(), control);
    }
  });

  test('the entitlements table scrolls inside its card, and the dialog that gives one fits', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);

    await grants.goto('extra-tokens-v1', 'Extra tokens');
    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(page.getByRole('table'));
    await expect(grants.removeButton('Tokens')).toBeAttached();

    await grants.editLink('Tokens').click();
    await expect(grants.dialog()).toBeVisible();
    await settle(page);
    await expectWithinScreen(grants.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await expect(grants.overageWarning()).toBeVisible();
    await expectWithinScreen(grants.overageWarning());
  });

  test('the prices tab keeps the width of the screen, its slots stacked and its table scrolling inside its card', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);

    await prices.goto('extra-seats-v1', 'Extra seats');

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(prices.slot('MONTHLY'));
    await expectWithinScreen(prices.slot('ANNUAL'));
    await expectScrollsInside(page.getByRole('table'));
    await expect(prices.deprecateButton('Extra seat, monthly')).toBeAttached();
  });

  test('the drawer of a price fits the screen', async ({ page }) => {
    const prices = new AddonPricesDriver(page);

    await page.goto('/addons/extra-seats-v2/prices?price=new');
    await expect(prices.drawer()).toBeVisible();
    await prices.amountField().fill('15.00');
    await expect(prices.livePreview()).toBeVisible();
    await settle(page);

    await expectWithinScreen(prices.drawer());
    await expectNoHorizontalScroll(page, WIDTH);
    await prices.createButton().scrollIntoViewIfNeeded();
    await expectWithinScreen(prices.createButton());
  });

  test('the compatibility tab keeps the width of the screen, with its warning', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);

    await compatibility.goto('extra-seats-v2', 'Extra seats');
    await compatibility.box(/^Pro/).click();
    await expect(compatibility.emptyWarning()).toBeVisible();

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(compatibility.emptyWarning());
  });
});

test.describe('the add-ons of an instance, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installAddonsWorld(page);
  });

  test('the card keeps the width of the screen, its table scrolling inside it, its stepper within reach', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-prod');
    await expect(addons.card()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(addons.card());
    await expectScrollsInside(addons.card().getByRole('table'));
    await expect(addons.more('Extra seats')).toBeAttached();
    await expectWithinScreen(addons.note());
  });

  test('the dialog that adds one fits the screen, with its price and its buttons', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-prod');
    await addons.openAttach();
    await addons.chooseAddon('Extra tokens · 2026');
    await expect(addons.attachDetails()).toBeVisible();
    await settle(page);

    await expectWithinScreen(addons.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await addons.attachButton().scrollIntoViewIfNeeded();
    await expectWithinScreen(addons.attachButton());
  });

  test('the confirmation to take one off fits the screen', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-prod');
    await addons.removeButton('Extra seats').click();
    await expect(addons.confirmation()).toBeVisible();
    await settle(page);

    await expectWithinScreen(addons.confirmation());
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the dialog that subscribes with add-ons fits the screen', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-fresh');
    await billing.subscribeLink().click();
    await expect(addons.subscribeAddons()).toBeVisible();
    await addons.subscribeChoice('Extra seats · 2026').scrollIntoViewIfNeeded();
    await settle(page);

    await expectWithinScreen(billing.dialog());
    await expectWithinScreen(addons.subscribeAddons());
    await expectNoHorizontalScroll(page, WIDTH);
  });
});
