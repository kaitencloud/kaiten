import { expect, expectErrorToast, test } from '../_support/app-test';
import { WebhooksDeliveriesDriver } from '../_support/drivers/webhooks-deliveries.driver';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import { WEBHOOK_REFUSALS } from '../_support/model/webhooks-app-model';
import { signInWithScopes } from '../_support/session-scopes';
import {
  AUDIT_WEBHOOK_URL,
  createWebhooksDeliveriesModel,
  createWebhooksDeliveriesUnavailableModel,
  OPS_WEBHOOK_URL,
  WEBHOOKS_DELIVERIES_NOW,
} from './webhooks.scenarios';

// What the deliveries show when saas-api cannot answer or refuses: a list that
// cannot be read, a body that cannot be read, has expired or was never found,
// a resend refused, and a session that may read but not resend.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(WEBHOOKS_DELIVERIES_NOW));
});

test('a row whose deliveries cannot be read says so after one retry, then recovers', async ({
  page,
}) => {
  await installWebhooksAppMocks(
    page,
    createWebhooksDeliveriesUnavailableModel(),
  );
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoList();

  const row = deliveries.list.row(OPS_WEBHOOK_URL);
  await expect(row).toContainText('Deliveries unavailable');
  await row.getByRole('button', { name: 'Retry' }).click();

  await expect(deliveries.deliveriesCell(OPS_WEBHOOK_URL)).toBeVisible();
});

test('a body that cannot be read shows an alert, Retry, and the attempts stay usable', async ({
  page,
}) => {
  const model = createWebhooksDeliveriesModel();
  // The first read and its two retries.
  model.refuseNext('getMessage', 'messageLookupFailed', 3);
  await installWebhooksAppMocks(page, model);
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoList();
  await deliveries.openDeliveries(OPS_WEBHOOK_URL);

  await expect(deliveries.detail()).toContainText('Failed to load the body.');
  await expect(deliveries.responseHeading()).toHaveText(
    'Response · attempt 1 of 1',
  );
  await expect(deliveries.attemptButtons()).toHaveCount(1);

  await deliveries.detail().getByRole('button', { name: 'Retry' }).click();

  await expect(deliveries.payload()).toBeVisible();
});

test('an expired body says so, and Resend is disabled with the reason', async ({
  page,
}) => {
  await installWebhooksAppMocks(page, createWebhooksDeliveriesModel());
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoList();
  await deliveries.openDeliveries(AUDIT_WEBHOOK_URL);

  await expect(deliveries.detail()).toContainText('Body no longer available');
  await expect(deliveries.resendButton()).toBeDisabled();
  await expect(await deliveries.resendExplanation()).toHaveText(
    'This delivery cannot be resent: its body is no longer available.',
  );
});

test('a delivery that is no longer found says so, not that its body expired', async ({
  page,
}) => {
  const model = createWebhooksDeliveriesModel();
  model.refuseNext('getMessage', {
    code: 'GetWebhookMessage.MessageNotFound',
    detail: 'the message does not exist',
    status: 404,
  });
  await installWebhooksAppMocks(page, model);
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoList();
  await deliveries.openDeliveries(OPS_WEBHOOK_URL);

  await expect(deliveries.detail()).toContainText(
    'This delivery can no longer be found.',
  );
  await expect(deliveries.detail()).not.toContainText(
    'Body no longer available',
  );
  await expect(deliveries.resendButton()).toBeDisabled();
});

for (const [refusal, message] of [
  [
    'payloadUnavailable',
    'The body of this delivery is no longer available, so it cannot be resent.',
  ],
  [
    'notDelivered',
    'This delivery can no longer be resent. It may have been removed.',
  ],
] as const) {
  test(`a resend refused as ${refusal} says why`, async ({ page }) => {
    const model = createWebhooksDeliveriesModel();
    model.refuseNext('resend', refusal);
    await installWebhooksAppMocks(page, model);
    const deliveries = new WebhooksDeliveriesDriver(page);
    await deliveries.gotoList();
    await deliveries.openDeliveries(OPS_WEBHOOK_URL);
    await expect(deliveries.payload()).toBeVisible();

    await deliveries.resend();

    await expectErrorToast(page, message);
    await expect(deliveries.resendButton()).toHaveText('Resend');
  });
}

test('a resend refused for its scope shows the API’s error', async ({
  page,
}) => {
  const model = createWebhooksDeliveriesModel();
  model.refuseNext('resend', 'missingScope');
  await installWebhooksAppMocks(page, model);
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoList();
  await deliveries.openDeliveries(OPS_WEBHOOK_URL);
  await expect(deliveries.payload()).toBeVisible();

  await deliveries.resend();

  await expectErrorToast(page, WEBHOOK_REFUSALS.missingScope.detail);
});

test('a session that may only read sees Resend disabled, with the reason', async ({
  page,
}) => {
  await signInWithScopes(page, ['read:webhooks']);
  await installWebhooksAppMocks(page, createWebhooksDeliveriesModel());
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoList();
  await deliveries.openDeliveries(OPS_WEBHOOK_URL);
  await expect(deliveries.payload()).toBeVisible();

  await expect(deliveries.resendButton()).toBeDisabled();
  await expect(await deliveries.resendExplanation()).toHaveText(
    'Your token needs the write:webhooks scope to resend a delivery.',
  );
});
