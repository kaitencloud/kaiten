import { expect, expectErrorToast, test } from '../_support/app-test';
import { WebhooksDeliveriesDriver } from '../_support/drivers/webhooks-deliveries.driver';
import { startInLanguage } from '../_support/language';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import {
  AUDIT_WEBHOOK_URL,
  CRM_WEBHOOK_URL,
  createWebhooksDeliveriesModel,
  OPS_WEBHOOK_URL,
  WEBHOOKS_DELIVERIES_NOW,
} from './webhooks.scenarios';

// The deliveries read in French: the column's line and its relative times, the
// dialog's rate, the outcomes with the plural French gives one, and a refusal
// of saas-api, whose own words are English, told in French.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(WEBHOOKS_DELIVERIES_NOW));
  await startInLanguage(page, 'fr');
});

test('the column and the dialog read in French', async ({ page }) => {
  await installWebhooksAppMocks(page, createWebhooksDeliveriesModel());
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoList();

  await expect(deliveries.deliveriesCell(OPS_WEBHOOK_URL)).toHaveAccessibleName(
    'Livraisons de ops.example.com : il y a 3 minutes · 2 échecs. Ouvrir les détails.',
  );
  await expect(deliveries.list.row(CRM_WEBHOOK_URL)).toContainText(
    "Aucune livraison pour l'instant",
  );
  await expect(deliveries.list.row(AUDIT_WEBHOOK_URL)).toContainText(
    'hier · toutes livrées',
  );

  await deliveries.openDeliveries(OPS_WEBHOOK_URL);

  // French writes a narrow space before the percent sign.
  await expect(deliveries.dialog()).toContainText(/19 \/ 25 livrées · 76\s%/);
  await expect(deliveries.deliveries().nth(1)).toContainText(
    'En cours · tentative 1',
  );
  await expect(deliveries.deliveries().nth(2)).toContainText(
    'Aucune réponse · 3 tentatives',
  );
  await expect(deliveries.deliveries().nth(3)).toContainText(
    'Nouvel essai après 1 tentative',
  );
  await expect(deliveries.deliveries().nth(6)).toContainText(
    'Événement inconnu',
  );
  const items = deliveries.chronology().getByRole('listitem');
  await expect(items.nth(26)).toContainText('Webhook créé');

  await deliveries.deliveries().nth(2).click();
  await expect(deliveries.responseHeading()).toHaveText(
    'Réponse · tentative 3 sur 3',
  );
});

test('a resend refused reads in French', async ({ page }) => {
  const model = createWebhooksDeliveriesModel();
  model.refuseNext('resend', 'payloadUnavailable');
  await installWebhooksAppMocks(page, model);
  const deliveries = new WebhooksDeliveriesDriver(page);
  await deliveries.gotoList();
  await deliveries.openDeliveries(OPS_WEBHOOK_URL);
  await expect(deliveries.payload()).toBeVisible();

  await deliveries.resend();

  await expectErrorToast(
    page,
    "Le corps de cette livraison n'est plus disponible : elle ne peut pas être renvoyée.",
  );
});
