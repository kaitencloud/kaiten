import { expect, expectToast, test } from '../_support/app-test';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  createLifecycleLicensesModel,
} from './lifecycle-world';

// The life of a subscription read in French: what the tab says of a trial, an invoice
// overdue, a cancellation and a plan change that wait for the boundary, the three
// dialogs, the trial of the subscription, and the listing of a family in the public
// catalogue. The dates and the amounts are written as the locale writes them, and no
// English word is left where a key would be missing. What the API wrote, a label of a
// price or the words of a refusal, is the API's and stays as it came.

const FRENCH_DATE = /\d{1,2} \p{L}+\.? 20\d\d/u;

test.describe('the life of a subscription, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await startInLanguage(page, 'fr');
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());
  });

  test('the notices of a trial and of a subscription past due', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-trial/billing');

    const trial = page.getByTestId('trial-notice');
    await expect(trial).toContainText(/Essai jusqu’au .*20\d\d \(UTC\)/);
    await expect(trial).toContainText('Il reste 6 jours');
    await expect(trial).toContainText('Rien n’est facturé pendant l’essai');
    await expect(trial).toContainText('La première facture est émise le');
    await expect(page.getByTestId('subscription-actions')).toContainText(
      'Changer d’offre',
    );

    await page.goto('/customers/instances/initech-late/billing');

    const late = page.getByTestId('past-due-notice');
    await expect(late).toContainText(
      /En retard de paiement depuis le .*20\d\d \(UTC\) \(36 jours\)/,
    );
    await expect(late).toContainText('L’accès est inchangé');
    await expect(
      late.getByRole('link', { name: 'Voir la facture' }),
    ).toBeVisible();
  });

  test('the notices of a cancellation and of a plan change, with what may be done', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-leaving/billing');

    const cancellation = page.getByTestId('cancellation-notice');
    await expect(cancellation).toContainText(/Prend fin le .*20\d\d \(UTC\)/);
    await expect(cancellation).toContainText('La période est payée');
    await expect(cancellation).toContainText('Motif : Moving in-house');
    await expect(
      cancellation.getByRole('button', { name: 'Réactiver' }),
    ).toBeVisible();

    await page.goto('/customers/instances/initech-moving/billing');

    const change = page.getByTestId('scheduled-change-notice');
    await expect(change).toContainText(
      /Passe à Pro v3 \(39,00\s\$US\/mois\) le .*20\d\d \(UTC\)/,
    );
    await expect(change).toContainText('Rien n’est proratisé');
    await expect(
      change.getByRole('button', { name: 'Annuler le changement' }),
    ).toBeVisible();
    const actions = page.getByTestId('subscription-actions');
    await expect(
      actions.getByRole('link', { name: 'Changer d’offre' }),
    ).toBeVisible();
    await expect(
      actions.getByRole('link', { name: 'Conditions de paiement' }),
    ).toBeVisible();
    await expect(
      actions.getByRole('link', { name: 'Annuler l’abonnement' }),
    ).toBeVisible();
  });

  test('taking a cancellation back says so in French', async ({ page }) => {
    await page.goto('/customers/instances/initech-leaving/billing');

    await page.getByRole('button', { name: 'Réactiver' }).click();

    await expectToast(page, 'L’annulation a été retirée');
  });

  test('the dialog that cancels, from its choices to what it did', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-seats/billing/cancel');

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Annuler l’abonnement de Initech Seats',
      }),
    ).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /Quand/ })).toContainText(
      /À la fin de la période : .*20\d\d \(UTC\)/,
    );
    await expect(dialog.getByTestId('cancel-explanation')).toContainText(
      'L’abonnement prend fin le',
    );
    await expect(dialog).toContainText('0/500 caractères');
    await expect(dialog.getByLabel('Motif')).toBeVisible();
    await expect(
      dialog.getByRole('checkbox', { name: 'Retirer aussi les add-ons' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('checkbox', {
        name: 'Fixer aussi la date de fin de licence',
      }),
    ).toBeVisible();

    await dialog.getByRole('combobox', { name: /Quand/ }).click();
    await page.getByRole('option', { name: 'Immédiatement' }).click();
    await expect(dialog.getByTestId('cancel-explanation')).toContainText(
      'C’est irréversible',
    );
    await dialog
      .getByRole('checkbox', { name: 'Retirer aussi les add-ons' })
      .check();
    await dialog.getByRole('button', { name: 'Annuler l’abonnement' }).click();

    await expect(dialog.getByTestId('canceled')).toContainText(
      'Abonnement annulé',
    );
    await expect(dialog.getByTestId('canceled')).toContainText(
      'Facture finale :',
    );
    await expect(dialog.getByTestId('cancel-follow-ups')).toContainText(
      'Add-ons retirés : extra-seats-v1.',
    );
  });

  test('the dialog that ends a trial, and the one that a reason that is too long is refused by', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-trial/billing/cancel');

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('button', { name: 'Terminer l’essai' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Garder l’essai' }),
    ).toBeVisible();
    await expect(dialog.getByTestId('cancel-explanation')).toContainText(
      'L’essai prend fin maintenant',
    );

    await page.goto('/customers/instances/initech-prod/billing/cancel');
    await page.getByRole('dialog').getByLabel('Motif').fill('é'.repeat(501));
    await page.getByRole('dialog').getByLabel('Motif').blur();

    await expect(page.getByRole('dialog')).toContainText(
      'Le motif fait au plus 500 caractères',
    );
  });

  test('the dialog that changes the plan, with a plan it refuses for its currency', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-prod/billing/plan-change');

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Changer l’offre de Initech Production',
      }),
    ).toBeVisible();
    await expect(dialog.getByTestId('plan-change-timeline')).toContainText(
      'Le changement prend effet le',
    );
    await expect(dialog.getByTestId('plan-change-timeline')).toContainText(
      'Offre actuelle :',
    );
    await dialog.getByRole('combobox', { name: /Nouvelle offre/ }).click();
    await expect(
      page.getByRole('option', { name: /Enterprise v1/ }),
    ).toContainText('Devise différente (EUR)');
    await page.getByRole('option', { name: /Pro v3/ }).click();
    await dialog
      .getByRole('button', { name: 'Programmer le changement' })
      .click();

    await expectToast(page, 'Le changement d’offre est programmé');
  });

  test('the dialog that says why a plan cannot change', async ({ page }) => {
    await page.goto('/customers/instances/initech-trial/billing/plan-change');

    await expect(page.getByTestId('plan-change-unavailable')).toContainText(
      'Une offre ne peut pas changer pendant un essai.',
    );
  });

  test('the dialog that changes the payment terms', async ({ page }) => {
    await page.goto('/customers/instances/initech-prod/billing/terms');

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Conditions de paiement de Initech Production',
      }),
    ).toBeVisible();
    await expect(dialog.getByTestId('payment-terms-current')).toContainText(
      'Les factures sont payables sous 30 jours (défaut de votre organisation).',
    );
    await expect(
      dialog.getByLabel('Délai de paiement (jours)'),
    ).toHaveAttribute('placeholder', 'Défaut de l’organisation : 30');
    await dialog.getByLabel('Délai de paiement (jours)').fill('366');
    await dialog.getByLabel('Délai de paiement (jours)').blur();
    await expect(dialog).toContainText(
      'Saisissez un nombre entier de jours, de 0 à 365',
    );
    await dialog.getByLabel('Délai de paiement (jours)').fill('45');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();

    await expectToast(page, 'Les conditions de paiement sont enregistrées');
  });

  test('the trial of a subscription, in the dialog that starts it and on the tab', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-fresh/billing/subscribe');

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Essai (jours)')).toHaveValue('14');
    await expect(dialog.getByTestId('subscribe-summary')).toContainText(
      'Aucune facture maintenant. La première facture est émise à la fin de l’essai, le',
    );
    await dialog
      .getByRole('button', { exact: true, name: 'Souscrire' })
      .click();

    await expect(dialog.getByTestId('subscribed')).toContainText(
      'L’essai dure jusqu’au',
    );
  });

  test('the invoice an overdue notice leads to is read in French as well', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-late/billing');

    await page
      .getByTestId('past-due-notice')
      .getByRole('link', { name: 'Voir la facture' })
      .click();

    await expect(new InvoiceDetailDriver(page).title()).toBeVisible();
    await expect(page.getByText(FRENCH_DATE).first()).toBeVisible();
  });
});

test.describe('the public catalogue of the licenses, read in French', () => {
  test('the switch of a family, its badge and what it says once changed', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    await startInLanguage(page, 'fr');
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installLicenseAppMocks(page, createLifecycleLicensesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await page.goto('/catalog/licenses');
    await expect(
      page.getByRole('switch', {
        name: 'Lister Enterprise dans le catalogue public',
      }),
    ).toBeChecked();
    await expect(
      licenses.family('Enterprise').getByText('Public', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('switch', { name: 'Lister Pro dans le catalogue public' })
      .click();

    await expectToast(page, 'La famille est listée dans le catalogue public');
  });
});

test.describe('a period being closed, read in French', () => {
  test('is said in place of an error, in French, and the request goes again by itself', async ({
    page,
  }) => {
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('cancelSubscription', {
      code: 'CancelSubscription.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      retryAfterSeconds: 1,
      status: 409,
    });
    await new InstanceBillingDriver(page).freezeTime();
    await startInLanguage(page, 'fr');
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(page, model);
    await page.goto('/customers/instances/initech-prod/billing/cancel');

    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Annuler l’abonnement' })
      .click();

    const closing = page.getByTestId('boundary-closing');
    await expect(closing).toContainText('Clôture de la période…');
    await expect(closing).toContainText(
      'Votre demande est renvoyée dans un instant.',
    );
    await expect(
      page.getByRole('dialog').getByTestId('canceled'),
    ).toBeVisible();
  });
});
