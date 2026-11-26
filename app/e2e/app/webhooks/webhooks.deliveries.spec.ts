import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import {
  delayRequests,
  pressTwiceInOneFrame,
} from '../_support/assertions/requests';
import { WebhooksDeliveriesDriver } from '../_support/drivers/webhooks-deliveries.driver';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import {
  AUDIT_WEBHOOK_URL,
  CRM_WEBHOOK_URL,
  createWebhooksDeliveriesModel,
  OPS_WEBHOOK_URL,
  WEBHOOKS_DELIVERIES_NOW,
} from './webhooks.scenarios';

// The deliveries of a webhook, from the list: a strip of its recent deliveries
// in its row, then the dialog with the chronology beside the selected delivery,
// its body, its response and its attempts, and a resend followed until it
// settles. The clock is frozen, so "3 minutes ago" stays true.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(WEBHOOKS_DELIVERIES_NOW));
  await installWebhooksAppMocks(page, createWebhooksDeliveriesModel());
});

test.describe('the Deliveries column', () => {
  test('shows each webhook’s recent deliveries as a strip and a line', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();

    await expect(
      deliveries.deliveriesCell(OPS_WEBHOOK_URL),
    ).toHaveAccessibleName(
      'Deliveries of ops.example.com: 3 minutes ago · 2 failures. Open details.',
    );
    await expect(deliveries.stripBars(OPS_WEBHOOK_URL)).toHaveCount(20);
    // Oldest on the left, the one being sent right before the newest.
    await expect(deliveries.stripBars(OPS_WEBHOOK_URL).nth(19)).toHaveAttribute(
      'data-status',
      'success',
    );
    await expect(deliveries.stripBars(OPS_WEBHOOK_URL).nth(18)).toHaveAttribute(
      'data-status',
      'sending',
    );
    await expect(deliveries.stripBars(OPS_WEBHOOK_URL).nth(16)).toHaveAttribute(
      'data-status',
      'retrying',
    );
    await expect(deliveries.list.row(CRM_WEBHOOK_URL)).toContainText(
      'No deliveries yet',
    );
    await expect(deliveries.list.row(AUDIT_WEBHOOK_URL)).toContainText(
      'yesterday · all delivered',
    );
  });

  test('draws a skeleton while a row reads its deliveries', async ({
    page,
  }) => {
    await delayRequests(page, {
      methods: ['GET'],
      ms: 1_500,
      pathname: /\/api\/webhooks\/[^/]+\/messages$/,
    });
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();

    await expect(
      deliveries.list.row(OPS_WEBHOOK_URL).locator('[aria-busy="true"]'),
    ).toBeVisible();
    await expect(deliveries.deliveriesCell(OPS_WEBHOOK_URL)).toBeVisible();
  });
});

test.describe('the Deliveries dialog', () => {
  test('opens with the rate, the chronology newest first, and the newest selected', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);

    const dialog = deliveries.dialog();
    await expect(dialog).toHaveAccessibleDescription(OPS_WEBHOOK_URL);
    await expect(dialog).toContainText('19 / 25 delivered · 76%');
    await expect(deliveries.deliveries()).toHaveCount(25);
    await expect(deliveries.deliveries().first()).toContainText(
      'Instance created200 · 84 ms',
    );
    await expect(deliveries.deliveries().first()).toHaveAttribute(
      'aria-current',
      'true',
    );
    // 25 deliveries, then the update and the creation.
    const items = deliveries.chronology().getByRole('listitem');
    await expect(items).toHaveCount(27);
    await expect(items.nth(25)).toContainText('Webhook updated');
    await expect(items.nth(26)).toContainText('Webhook created');
    await expect(deliveries.payload()).toContainText('"slug": "acme-prod-0"');
  });

  test('reads each delivery’s outcome, an unknown event as its type', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);

    await expect(deliveries.deliveries().nth(1)).toContainText(
      'Sending · attempt 1',
    );
    await expect(deliveries.deliveries().nth(2)).toContainText(
      'No response · 3 attempts',
    );
    await expect(deliveries.deliveries().nth(3)).toContainText(
      'Retrying after 1 attempt · next attempt',
    );
    await expect(deliveries.deliveries().nth(4)).toContainText(
      '200 · 97 ms · 3 attempts',
    );
    await expect(deliveries.deliveries().nth(5)).toContainText(
      'com.kaiten.gadget.v1.created',
    );
    await expect(deliveries.deliveries().nth(6)).toContainText('Unknown event');
  });

  test('swaps the detail for the delivery selected, and shows each attempt’s response', async ({
    page,
  }) => {
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);

    await deliveries.deliveries().nth(2).click();

    await expect(deliveries.deliveries().nth(2)).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(deliveries.responseHeading()).toHaveText(
      'Response · attempt 3 of 3',
    );
    await expect(deliveries.detail()).toContainText(
      'The endpoint did not answer.',
    );
    await expect(deliveries.attemptButtons()).toHaveCount(3);

    await deliveries.selectAttempt(1);

    await expect(deliveries.responseHeading()).toHaveText(
      'Response · attempt 1 of 3',
    );
    await expect(deliveries.detail()).toContainText('Service unavailable');
    await expect(deliveries.payload()).toContainText('"slug": "acme-prod-2"');
  });

  test('copies the body', async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);
    await expect(deliveries.payload()).toBeVisible();

    await deliveries.copyPayload();

    await expectToast(page, 'Body copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      '"id": "evt_ops_00"',
    );
  });

  test('resends once, even pressed twice, and follows the attempt until it settles', async ({
    page,
  }) => {
    const resends = recordWrites(page, /\/api\/webhooks\/.+\/resend$/);
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);
    await deliveries.deliveries().nth(7).click();
    await expect(deliveries.responseHeading()).toHaveText(
      'Response · attempt 1 of 1',
    );

    await pressTwiceInOneFrame(deliveries.resendButton());

    await expectToast(
      page,
      'Resend queued. The new attempt will appear shortly.',
    );
    expect(resends).toEqual([
      {
        body: null,
        method: 'POST',
        pathname: '/api/webhooks/ep_ops/messages/msg_ops_07/resend',
      },
    ]);
    await expect(deliveries.responseHeading()).toHaveText(
      'Response · attempt 2 of 2',
    );
    await expect(deliveries.detail()).toContainText('Resent manually');
    // The model settles the attempt on the message's second read: the watch
    // reads it again within a few seconds, with no reload.
    await expect(
      deliveries.detail().getByText('OK', { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(deliveries.deliveries().nth(7)).toContainText('2 attempts', {
      timeout: 15_000,
    });
  });
});
