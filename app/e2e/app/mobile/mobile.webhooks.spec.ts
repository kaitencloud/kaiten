import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectNoHorizontalScroll,
  expectOnScreen,
} from '../_support/assertions/layout';
import { WebhooksFormDriver } from '../_support/drivers/webhooks-form.driver';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import { createWebhooksFormModel } from '../webhooks/webhooks.scenarios';

// The create and edit page of a webhook on the narrowest phone: the page keeps
// the width of the screen, and its one column reads Destination, the catalogue,
// Selection, then the actions, while the DOM, and so the tab order, still
// reaches the URL before the catalogue.

const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

test.beforeEach(async ({ page }) => {
  await installWebhooksAppMocks(page, createWebhooksFormModel());
});

async function top(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box?.y ?? 0;
}

test.describe('the webhook form, on the narrowest phone', () => {
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
