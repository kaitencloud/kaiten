import type { Page } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { WebhooksDeliveriesDriver } from '../_support/drivers/webhooks-deliveries.driver';
import { WebhooksFormDriver } from '../_support/drivers/webhooks-form.driver';
import { WebhooksListDriver } from '../_support/drivers/webhooks-list.driver';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import {
  createWebhooksDeliveriesModel,
  createWebhooksFormModel,
  createWebhookWithoutFilterModel,
  OPS_WEBHOOK_URL,
  WEBHOOKS_DELIVERIES_NOW,
} from '../webhooks/webhooks.scenarios';

// The webhooks as a person who cannot use a mouse or a screen meets them: no
// violation on the create and edit page, folded, opened and searched, in either
// theme; every control of the picker named, the group checkbox saying when it
// holds part of its group, and the list's Edit action named by the host. The
// deliveries too: the list with its strips, the dialog with a body long enough
// to scroll, and the History tab's detail, the focus held and given back.

async function expectAccessibleInBothThemes(page: Page) {
  await settle(page);
  await expectNoAccessibilityViolations(page);

  await useLightTheme(page);
  await expectNoAccessibilityViolations(page);
}

test.describe('accessibility of the webhook form', () => {
  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhooksFormModel());
  });

  test('the create page, every group folded, has no violation in either theme', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();
    await expect(form.group('Customers')).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the create page with a group open and a search under way has none', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();
    await form.openGroup('Customers');
    await form.row('Customer created').click();
    await form.search('created');
    await expect(form.row('Customer created')).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the edit page has none', async ({ page }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_lifecycle');
    await expect(form.selectionCount()).toHaveText('7 events selected');

    await expectAccessibleInBothThemes(page);
  });

  test('names the controls of the picker and says what a group holds', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_customers');

    await expect(form.url()).toHaveAccessibleName(/^Webhook URL/);
    await expect(form.searchField()).toHaveAccessibleName('Search events');
    await expect(form.preset('Billing')).toHaveAccessibleDescription(
      '30 events',
    );
    await expect(form.groupCheckbox('Customers')).toHaveAccessibleName(
      'Select all Customers events',
    );
    await expect(form.groupCheckbox('Customers')).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
    await expect(form.group('Customers')).toHaveAccessibleName(
      'Customers 2 of 4 selected',
    );
    await expect(
      form.chip('CUSTOMER_CREATED').getByRole('button'),
    ).toHaveAccessibleName('Remove Customer created');
  });

  test('moves the focus to the next chip once one is removed', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_customers');

    await form.chip('CUSTOMER_CREATED').getByRole('button').focus();
    await page.keyboard.press('Enter');

    await expect(form.selectionCount()).toHaveText('1 event selected');
    await expect(
      form.chip('CUSTOMER_UPDATED').getByRole('button'),
    ).toBeFocused();
  });
});

test.describe('accessibility of the edit page of a webhook without an event filter', () => {
  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhookWithoutFilterModel());
  });

  test('has none with the box ticked, nor once it is unticked from the keyboard', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_no_filter');
    await expect(form.keepEveryEvent()).toBeChecked();

    await expectAccessibleInBothThemes(page);

    await form.keepEveryEvent().focus();
    await page.keyboard.press('Space');
    await expect(form.keepEveryEvent()).not.toBeChecked();
    await expect(form.narrowingNotice()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });
});

test.describe('accessibility of the list of webhooks', () => {
  test('names the Edit action of each row by the host of its webhook', async ({
    page,
  }) => {
    await installWebhooksAppMocks(page, createWebhooksFormModel());
    const list = new WebhooksListDriver(page);
    await list.gotoList();

    await expect(
      list.editRow('https://ops.example.com/kaiten/instances'),
    ).toHaveAccessibleName('Edit webhook ops.example.com');
    await expectNoAccessibilityViolations(page);
  });
});

test.describe('accessibility of the deliveries', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(WEBHOOKS_DELIVERIES_NOW));
    await installWebhooksAppMocks(page, createWebhooksDeliveriesModel());
  });

  test('the list with its Deliveries column has no violation in either theme', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await expect(deliveries.deliveriesCell(OPS_WEBHOOK_URL)).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the dialog, its long body open, has none, holds the focus and gives it back', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);
    // The newest delivery's body is taller than its box: it scrolls.
    await expect(deliveries.payload()).toBeVisible();
    const scrolls = await deliveries
      .payload()
      .evaluate((node) => node.scrollHeight > node.clientHeight);
    expect(scrolls).toBe(true);

    await expectDialogAccessible(page, deliveries.dialog());

    await expect(deliveries.deliveriesCell(OPS_WEBHOOK_URL)).toBeFocused();
  });

  test('the dialog has none in the light theme', async ({ page }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await useLightTheme(page);
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);
    await expect(deliveries.payload()).toBeVisible();
    await deliveries.deliveries().nth(2).click();
    await expect(deliveries.responseHeading()).toHaveText(
      'Response · attempt 3 of 3',
    );

    await settle(page);
    await expectNoAccessibilityViolations(page);

    // A retrying delivery selected: its amber outcome on the selection.
    await deliveries.deliveries().nth(3).click();
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the History tab’s detail has none, and holds the focus', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoHistory();
    await deliveries.viewDetails(deliveries.historyRows().first());
    await expect(deliveries.payload()).toBeVisible();

    await expectDialogAccessible(page, deliveries.historyDialog());
  });
});
