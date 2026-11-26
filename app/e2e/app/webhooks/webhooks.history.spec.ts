import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { WebhooksDeliveriesDriver } from '../_support/drivers/webhooks-deliveries.driver';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import {
  createWebhooksDeliveriesModel,
  createWebhooksLegacyHistoryModel,
  OPS_MESSAGES,
  WEBHOOKS_DELIVERIES_NOW,
} from './webhooks.scenarios';

// The History tab: one row per attempt, each opening the shared detail of its
// delivery with the clicked attempt selected, a search that finds a delivery
// by its Svix message id, a resend that keeps the reader's search, and the
// history of an older saas-api that names no message.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(WEBHOOKS_DELIVERIES_NOW));
});

test.describe('the History tab', () => {
  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhooksDeliveriesModel());
  });

  test('opens the detail of a delivered and of a failed attempt', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoHistory();

    // Newest first: the newest delivery, delivered at once.
    await deliveries.viewDetails(deliveries.historyRows().first());
    await expect(deliveries.historyDialog()).toHaveAccessibleDescription(
      /^Instance created on /,
    );
    await expect(deliveries.payload()).toContainText('"id": "evt_ops_00"');
    await expect(deliveries.responseHeading()).toHaveText(
      'Response · attempt 1 of 1',
    );
    await deliveries
      .historyDialog()
      .getByRole('button', { name: 'Close' })
      .click();
    await expect(deliveries.historyDialog()).toHaveCount(0);

    // The first attempt of the message that failed three times.
    await deliveries.search(OPS_MESSAGES.failed);
    await expect(deliveries.historyRows()).toHaveCount(3);
    await deliveries.viewDetails(deliveries.historyRows().last());

    await expect(deliveries.responseHeading()).toHaveText(
      'Response · attempt 1 of 3',
    );
    await expect(deliveries.detail()).toContainText('Service unavailable');
    await expect(deliveries.payload()).toContainText('"id": "evt_ops_02"');
  });

  test('resends from the detail, keeping the search and the dialog open', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoHistory();
    await deliveries.search(OPS_MESSAGES.failedOnce);
    await expect(deliveries.historyRows()).toHaveCount(1);
    await deliveries.viewDetails(deliveries.historyRows().first());
    await expect(deliveries.payload()).toBeVisible();

    await deliveries.resend();

    await expectToast(
      page,
      'Resend queued. The new attempt will appear shortly.',
    );
    // The new attempt joins the list; the clicked one stays selected.
    await expect(deliveries.attemptButtons()).toHaveCount(2);
    await expect(deliveries.responseHeading()).toHaveText(
      'Response · attempt 1 of 2',
    );
    await expect(deliveries.historyDialog()).toBeVisible();

    // Behind it, the history was read again and the search kept: the manual
    // attempt is a row of the same search.
    await deliveries
      .historyDialog()
      .getByRole('button', { name: 'Close' })
      .click();
    await expect(deliveries.searchBox()).toHaveValue(OPS_MESSAGES.failedOnce);
    await expect(deliveries.historyRows()).toHaveCount(2);
  });
});

test('the history of an older saas-api opens its detail without reading a message', async ({
  page,
}) => {
  await installWebhooksAppMocks(page, createWebhooksLegacyHistoryModel());
  const messageReads = recordWrites(page, /\/api\/webhooks\/.+\/messages/, [
    'GET',
  ]);
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoHistory();

  await deliveries.viewDetails(deliveries.historyRows().nth(2));

  await expect(deliveries.detail()).toContainText(
    'This version of the API does not report the message of a delivery',
  );
  await expect(deliveries.responseHeading()).toHaveText(
    'Response · attempt 1 of 1',
  );
  await expect(deliveries.resendButton()).toBeDisabled();
  expect(messageReads).toEqual([]);
});
