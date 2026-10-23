import { expect, test } from '../_support/app-test';
import { CheckoutSessionsDriver } from '../_support/drivers/checkout-sessions.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import {
  CHECKOUT_NOW,
  createCheckoutSessionsBillingModel,
  createCheckoutSessionsCustomersModel,
} from './checkout-sessions.scenarios';

// The console reads its language when it starts. The checkouts have their text in French,
// with the word « checkout » kept, their dates and amounts as the locale writes them, and
// no English word where a key would be missing. What the API wrote (an e-mail, a
// reference, a slug) stays as it came.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(CHECKOUT_NOW));
  await startInLanguage(page, 'fr');
  await installCustomerAppMocks(page, createCheckoutSessionsCustomersModel());
  await installBillingAppMocks(page, createCheckoutSessionsBillingModel());
});

test.describe('the checkouts, read in French', () => {
  test('the list: its title, its tab, its columns and the state of each checkout', async ({
    page,
  }) => {
    await page.goto('/customers/checkout-sessions');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Checkouts' }),
    ).toBeVisible();
    await expect(page.getByText('Checkouts anonymes démarrés')).toBeVisible();
    const columns = page.getByRole('columnheader');
    for (const header of [
      'Statut',
      'E-mail',
      'Formule',
      'Dû aujourd’hui',
      'Clé publiable',
      'Client',
      'Instance',
      'Créé',
      'Clos',
    ]) {
      await expect(columns.filter({ hasText: header }).first()).toBeVisible();
    }
    const checkouts = new CheckoutSessionsDriver(page);
    await expect(checkouts.row('dana@hooli.test')).toContainText('Ouvert');
    await expect(checkouts.row('ravi@initech.test')).toContainText(
      'En attente de paiement',
    );
    await expect(checkouts.row('alice@acme.test')).toContainText('Terminé');
    await expect(checkouts.row('alice@acme.test')).toContainText('Mensuel');
    await expect(checkouts.row('visitor@example.test')).toContainText(
      'Abandonné',
    );
    await expect(checkouts.row('finance@globex.test')).toContainText('Expiré');
    await expect(checkouts.row('finance@globex.test')).toContainText(
      'Reste après l’expiration',
    );
    await expect(checkouts.row('alice@acme.test')).toContainText('49,00');
    await expect(checkouts.row('alice@acme.test')).toContainText('6 oct. 2026');
  });

  test('the toolbar and the empty filtered list', async ({ page }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await page.goto('/customers/checkout-sessions');
    await expect(
      page.getByPlaceholder(
        'Rechercher par e-mail, référence, licence, client ou clé…',
      ),
    ).toBeVisible();
    await page
      .getByPlaceholder(
        'Rechercher par e-mail, référence, licence, client ou clé…',
      )
      .fill('introuvable');

    await expect(checkouts.filteredEmpty()).toContainText(
      'Aucun checkout ne correspond',
    );
    await expect(
      page.getByRole('button', { name: 'Effacer les filtres' }),
    ).toBeVisible();
  });

  test('opens already narrowed on a status, whose chip is in French', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await page.goto('/customers/checkout-sessions?status=expired');

    await expect(checkouts.rows()).toHaveCount(1);
    await expect(checkouts.chips()).toContainText('Expiré');
  });

  test('the panel: each label, the amounts, the dates, the note of an expired checkout', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await page.goto('/customers/checkout-sessions?session=cs-expired');

    await expect(checkouts.detail()).toBeVisible();
    await expect(
      page.getByTestId('checkout-session-expired-note'),
    ).toContainText(
      'Ce checkout a expiré après la création de son client et de son instance',
    );
    for (const label of [
      'E-mail',
      'Référence client',
      'Licence',
      'Période',
      'Prix',
      'Add-ons',
      'Clé publiable',
      'Essai',
      'Client créé',
      'Instance créée',
      'Créé',
      'Expire',
      'Terminé',
      'Clos',
    ]) {
      await expect(checkouts.detailRow(label)).toBeVisible();
    }
    await expect(checkouts.detailRow('Essai')).toContainText('Pas d’essai');
    await expect(page.getByText('Dû aujourd’hui').last()).toBeVisible();
    await expect(page.getByText('Sous-total')).toBeVisible();
  });

  test('a checkout the API deleted is told as gone', async ({ page }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await page.goto('/customers/checkout-sessions?session=cs-deleted');

    await expect(checkouts.gone()).toContainText('n’existe plus');
  });
});
