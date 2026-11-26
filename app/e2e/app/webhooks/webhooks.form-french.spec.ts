import { expect, test } from '../_support/app-test';
import { WebhooksFormDriver } from '../_support/drivers/webhooks-form.driver';
import { startInLanguage } from '../_support/language';
import { installWebhooksAppMocks } from '../_support/mocks/install-webhooks-app-mocks';
import {
  createWebhooksFormModel,
  createWebhookWithoutFilterModel,
} from './webhooks.scenarios';

// The console reads its language when it starts. The create and edit page of a
// webhook has its titles, its groups, its presets, its counters and the chat
// notice in French, with the plural French gives zero and one. What the API
// wrote (a URL, an event's NAME) stays as it came.

const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';

test.beforeEach(async ({ page }) => {
  await startInLanguage(page, 'fr');
});

test.describe('the webhook form, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhooksFormModel());
  });

  test('the create page: titles, groups, presets and counters', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    await expect(form.heading()).toHaveText('Nouveau webhook');
    await expect(form.picker()).toBeVisible();
    await expect(form.selection()).toBeVisible();
    await expect(form.selectionCount()).toHaveText('0 événement sélectionné');
    await expect(form.group('Clients')).toContainText('0 / 4');
    await expect(form.group('Factures')).toBeVisible();
    await expect(form.preset('Cycle de vie des instances')).toBeVisible();
    await expect(form.preset("Alertes d'usage")).toBeVisible();
    await expect(form.preset('Facturation')).toHaveAccessibleDescription(
      '30 événements',
    );
    await expect(form.groupCheckbox('Clients')).toHaveAccessibleName(
      'Sélectionner tous les événements « Clients »',
    );
    await expect(form.submitButton()).toHaveText('Créer le webhook');

    await form.preset('Facturation').click();

    await expect(form.selectionCount()).toHaveText(
      '30 événements sélectionnés',
    );
    await expect(form.group('Abonnements')).toContainText('13 / 13');
    await expect(form.chip('Les 13 événements').first()).toBeVisible();

    await page.getByRole('button', { name: 'Tout effacer' }).click();
    await form.openGroup('Clients');
    await form.row('Client créé').click();

    await expect(form.selectionCount()).toHaveText('1 événement sélectionné');
    await expect(form.chip('CUSTOMER_CREATED')).toBeVisible();
  });

  test('the search and its empty state', async ({ page }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    await form.search('facture payée');
    await expect(form.row('Facture payée')).toBeVisible();
    await expect(form.groupCheckbox('Factures')).toHaveAccessibleName(
      'Sélectionner les événements « Factures » trouvés',
    );

    await form.search('zzz');
    await expect(form.picker()).toContainText(
      'Aucun événement ne correspond à « zzz ».',
    );
  });

  test('the chat notice', async ({ page }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoNew();

    await form.fillUrl(SLACK_URL);

    await expect(form.chatNotice()).toContainText(
      'Envoyé comme messages de chat',
    );
    await expect(form.chatNotice()).toContainText(
      'Ceci est un webhook entrant Slack.',
    );
  });

  test('the edit page', async ({ page }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_customers');

    await expect(form.heading()).toHaveText('Modifier le webhook');
    await expect(form.selectionCount()).toHaveText('2 événements sélectionnés');
    await expect(form.submitButton()).toHaveText('Enregistrer');
    await expect(
      page.getByRole('navigation', { name: 'breadcrumb' }),
    ).toContainText('Modifier');
  });
});

test.describe('the edit page of a webhook without an event filter, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await installWebhooksAppMocks(page, createWebhookWithoutFilterModel());
  });

  test('the box that keeps every event, and the warning once it is unticked', async ({
    page,
  }) => {
    const form = new WebhooksFormDriver(page);
    await form.gotoEdit('ep_no_filter');

    await expect(form.keepEveryEvent()).toHaveAccessibleName(
      'Continuer à recevoir tous les événements',
    );
    await expect(form.keepEveryEvent()).toHaveAccessibleDescription(
      "Ce webhook n'a pas de filtre d'événements : il reçoit tous les événements, y compris les types d'événements ajoutés plus tard.",
    );
    await expect(form.selectionCount()).toHaveText('Tous les événements');

    await form.keepEveryEvent().click();
    await expect(form.narrowingNotice()).toHaveText(
      'Une fois enregistré, ce webhook ne recevra plus que les événements choisis. La console ne pourra plus lui faire recevoir tous les événements.',
    );
    await expect(form.selectionCount()).toHaveText('0 événement sélectionné');
  });
});
