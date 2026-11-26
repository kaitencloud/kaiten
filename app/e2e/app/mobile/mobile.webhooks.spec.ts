import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectNoHorizontalScroll,
  expectOnScreen,
  expectScrollsInside,
} from '../_support/assertions/layout';
import { WebhooksDeliveriesDriver } from '../_support/drivers/webhooks-deliveries.driver';
import { WebhooksFormDriver } from '../_support/drivers/webhooks-form.driver';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import {
  createWebhooksDeliveriesModel,
  createWebhooksFormModel,
  OPS_WEBHOOK_URL,
  WEBHOOKS_DELIVERIES_NOW,
} from '../webhooks/webhooks.scenarios';

// The create and edit page of a webhook on the narrowest phone: the page keeps
// the width of the screen, and its one column reads Destination, the catalogue,
// Selection, then the actions, while the DOM, and so the tab order, still
// reaches the URL before the catalogue.

const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

async function top(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box?.y ?? 0;
}

test.describe('the webhook form, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhooksFormModel());
  });

  test('keeps the width of the screen, with a group open and a Slack URL typed', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();
    await form.fillUrl(
      'https://hooks.slack.com/services/T000/B000/XXXX',
    );
    await expect(form.chatNotice()).toBeVisible();
    await form.preset('Billing').click();
    await form.openGroup('Subscriptions');
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectOnScreen(page, form.url());
    await expectOnScreen(page, form.searchField());
    await expectOnScreen(page, form.row('Add-on attached to an instance'));
    await form.submitButton().scrollIntoViewIfNeeded();
    await expectOnScreen(page, form.submitButton());
  });

  test('shows Destination, the catalogue, Selection then the actions, the URL first in the DOM', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();
    await settle(page);

    const url = await top(form.url());
    const picker = await top(form.picker());
    const selection = await top(form.selection());
    const actions = await top(form.submitButton());
    expect(url).toBeLessThan(picker);
    expect(picker).toBeLessThan(selection);
    expect(selection).toBeLessThan(actions);

    const urlBeforeSearch = await form
      .url()
      .evaluate(
        (field, search) =>
          search !== null &&
          (field.compareDocumentPosition(search) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
        await form.searchField().elementHandle(),
      );
    expect(urlBeforeSearch).toBe(true);
  });

  test('keeps the width of the screen on the edit page', async ({ page }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_lifecycle');
    await expect(form.selectionCount()).toHaveText('7 events selected');
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectOnScreen(page, form.url());
    await expectOnScreen(page, form.selection());
  });
});

test.describe('the deliveries, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(WEBHOOKS_DELIVERIES_NOW));
    await installWebhooksAppMocks(page, createWebhooksDeliveriesModel());
  });

  test('the list keeps the width of the screen, the table scrolls inside', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await expect(deliveries.deliveriesCell(OPS_WEBHOOK_URL)).toBeAttached();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(page.getByRole('table'));
  });

  test('the dialog shows the list, then the delivery chosen, and goes back', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await deliveries.deliveriesCell(OPS_WEBHOOK_URL).scrollIntoViewIfNeeded();
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);

    await expect(deliveries.chronology()).toBeVisible();
    await expect(deliveries.detail()).toBeHidden();
    await expectOnScreen(page, deliveries.dialog());

    await deliveries.deliveries().first().click();

    await expect(deliveries.chronology()).toBeHidden();
    await expect(deliveries.payload()).toBeVisible();
    await expectOnScreen(page, deliveries.dialog());
    await expectOnScreen(page, deliveries.payload());
    // The long body scrolls inside its own box, not the page.
    const scrolls = await deliveries
      .payload()
      .evaluate(
        (node) =>
          node.scrollWidth > node.clientWidth ||
          node.scrollHeight > node.clientHeight,
      );
    expect(scrolls).toBe(true);
    await expectNoHorizontalScroll(page, WIDTH);

    await deliveries.back();

    await expect(deliveries.chronology()).toBeVisible();
    await expect(deliveries.detail()).toBeHidden();
  });
});
