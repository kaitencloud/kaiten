import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectNoHorizontalScroll,
  expectScrollsInside,
} from '../_support/assertions/layout';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { UsageHistoryDriver } from '../_support/drivers/usage-history.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createSubscriptionsModel } from '../billing/billing.scenarios';
import { createBillingCustomersModel } from '../customers/customers.scenarios';
import { createBilledInstancesModel } from '../instances/instances.scenarios';

// The narrowest phone the billing screens are checked at, as for the invoices.
const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

/** The element is wholly on the screen: neither of its sides is cut off. */
async function expectWithinScreen(element: Locator) {
  const box = await element.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
}

/**
 * The icon in the header of a card is 20px wide whatever the sentence beside it
 * says: a long description that wraps must not squeeze it.
 */
async function expectHeaderIconKeepsItsSize(card: Locator) {
  const box = await card.locator('svg').first().boundingBox();

  expect(box?.width).toBeCloseTo(20, 0);
  expect(box?.height).toBeCloseTo(20, 0);
}

test.describe('the billing of an instance, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('the tab keeps the width of the screen: its cards fit, and its invoices scroll inside their own', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('acme-production');
    await expect(billing.invoicesCount()).toHaveText('2 invoices shown');

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(billing.subscriptionCard());
    await expectWithinScreen(billing.upcomingCard());
    await expectWithinScreen(billing.wouldHoldBanner());
    await expectScrollsInside(page.getByRole('table').first());
  });

  test('an instance nobody bills keeps it too, with its way to subscribe on the screen', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('beta-staging');
    await expect(billing.notSubscribed()).toBeVisible();

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(billing.subscribeLink());
  });

  test('the dialog that subscribes fits the screen, with the price it offers and the e-mail it asks for', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await expectWithinScreen(billing.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(billing.basePriceField());
    await expectWithinScreen(billing.billingEmailNotice());
    await billing.confirmButton().scrollIntoViewIfNeeded();
    await expectWithinScreen(billing.confirmButton());
  });

  test('the preview of the upcoming invoice fits the screen', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('acme-production');
    await billing.viewLinesButton().click();

    const preview = page.getByRole('dialog', { name: 'Upcoming invoice' });
    await expect(preview).toBeVisible();
    await expectWithinScreen(preview);
    await expectNoHorizontalScroll(page, WIDTH);
  });
});

test.describe('the usage history, on the narrowest phone', () => {
  test('the drawer takes the screen, and its list scrolls inside it', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    await history.freezeTime();
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await expect(history.count()).toHaveText('100 reports shown');

    // The drawer slides in from the side: it is measured where it comes to rest.
    await settle(page);
    await expectWithinScreen(history.drawer());
    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(history.drawer().getByRole('table'));
    await expectWithinScreen(history.exportButton());
    await expectWithinScreen(history.fromField());
    await expectWithinScreen(history.beforeField());
  });

  test('the notice for a period beyond the retention fits, with its button', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    await history.freezeTime();
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await history.fromField().fill('2025-01-01');

    await expect(history.outsideRetention()).toBeVisible();
    await settle(page);
    await expectWithinScreen(history.outsideRetention());
    await expectWithinScreen(
      history.outsideRetention().getByRole('button', { name: /^Show from / }),
    );
  });
});

test.describe('a customer and the settings of billing, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createSubscriptionsModel());
  });

  test('the page of a customer keeps the width of the screen, its invoices scrolling inside their card', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await detail.goto('acme-corp');
    await expect(detail.invoicesCount()).toHaveText('4 invoices shown');

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(detail.invoicesCard());
    await expectScrollsInside(detail.invoicesCard().getByRole('table'));
    await expectWithinScreen(detail.detailsRow('Billing e-mail'));
  });

  test('the settings of billing keep the width of the screen, and the list of methods fits', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);

    await settings.goto();

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(settings.providers());
    await expectWithinScreen(settings.defaults());
    await expectWithinScreen(settings.retention());
    await expectHeaderIconKeepsItsSize(settings.providers());
    await expectHeaderIconKeepsItsSize(settings.defaults());
    await expectHeaderIconKeepsItsSize(settings.retention());
    await settings.collectionMethod().click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await settle(page);
    await expectWithinScreen(page.getByRole('listbox'));
  });

  test('the export of the data keeps the width of the screen, and each month has its button on it', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await settings.gotoSettings();
    await expect(settings.exportCard()).toBeVisible();

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(settings.exportCard());
    await expectHeaderIconKeepsItsSize(settings.exportCard());
    await expectWithinScreen(settings.monthButton('September 2026'));
  });
});

test.describe('the refusal to delete, on the narrowest phone', () => {
  test('the dialog that says what keeps an instance fits the screen', async ({
    page,
  }) => {
    const list = new InstancesListDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await list.goto();
    await list.openDeleteDialog('Acme Legacy');
    await page.getByRole('button', { name: 'Confirm' }).click();

    const refusal = page.getByRole('dialog', {
      name: 'This instance cannot be deleted',
    });
    await expect(refusal).toBeVisible();
    await expectWithinScreen(refusal);
    await expectNoHorizontalScroll(page, WIDTH);
  });
});
