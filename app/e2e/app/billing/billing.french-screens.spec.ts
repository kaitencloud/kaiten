import { expect, test } from '../_support/app-test';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { UsageHistoryDriver } from '../_support/drivers/usage-history.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createBillingCustomersModel } from '../customers/customers.scenarios';
import { createBilledInstancesModel } from '../instances/instances.scenarios';
import { createSubscriptionsModel } from './billing.scenarios';

// The console reads its language when it starts. The billing of an instance, the
// usage history, the e-mail and the invoices of a customer, the settings and the
// export before an organization is deleted have their text in French, their dates
// and amounts as the locale writes them, and no English word where a key would be
// missing. What the API wrote, a label of a price or the words of a refusal, is the
// API's and stays as it came.

const FRENCH_DATE = /\d{1,2} \p{L}+\.? 20\d\d/u;

test.describe('the billing of an instance, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await startInLanguage(page, 'fr');
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('the tab, its subscription, its upcoming invoice and its invoices', async ({
    page,
  }) => {
    await page.goto('/customers/instances/acme-production/billing');

    await expect(
      page.getByRole('tab', { exact: true, name: 'Facturation' }),
    ).toHaveAttribute('aria-selected', 'true');
    const billing = new InstanceBillingDriver(page);
    const card = billing.card('Abonnement');
    await expect(card).toBeVisible();
    await expect(billing.row(card, 'Encaissement')).toContainText(
      'Facture envoyée au client',
    );
    await expect(billing.row(card, 'Encaissement')).toContainText(
      'Défaut de l’organisation',
    );
    await expect(billing.row(card, 'Délai de paiement')).toContainText(
      'Payable sous 45 jours',
    );
    await expect(billing.row(card, 'Délai de paiement')).toContainText(
      'Ce contrat',
    );
    await expect(billing.row(card, 'Période en cours')).toContainText(
      FRENCH_DATE,
    );
    await expect(billing.row(card, 'Période en cours')).toContainText('(UTC)');
    await expect(billing.row(card, 'Prochaine échéance')).toContainText(
      FRENCH_DATE,
    );
    // The amount as French writes it; the label of the price is the API's.
    await expect(billing.row(card, 'Prix de base')).toContainText(
      /499,00\s\$US\/mois/,
    );
    await expect(billing.row(card, 'Prix de base')).toContainText(
      'Enterprise, monthly',
    );

    const upcoming = billing.card('Prochaine facture');
    await expect(upcoming).toContainText('2 lignes');
    await expect(upcoming).toContainText(/503,20\s\$US/);
    await expect(billing.wouldHoldBanner()).toContainText(
      'Cette facture serait bloquée',
    );
    await expect(
      billing
        .wouldHoldBanner()
        .getByRole('link', { name: 'Voir son historique d’usage' }),
    ).toBeVisible();

    await billing.viewLinesButton('Voir les lignes').click();
    await expect(
      page.getByRole('dialog', { name: 'Prochaine facture' }),
    ).toContainText(
      'C’est un aperçu : rien n’est enregistré, envoyé ni facturé.',
    );
  });

  test('an instance nobody bills, and the dialog that subscribes it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await page.goto('/customers/instances/beta-staging/billing');

    await expect(billing.notSubscribed()).toContainText('Non abonnée');
    await page.getByRole('link', { exact: true, name: 'Souscrire' }).click();
    const dialog = billing.dialog();
    await expect(
      dialog.getByRole('heading', {
        name: 'Souscrire un abonnement pour Beta Staging',
      }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel('Délai de paiement (jours)'),
    ).toHaveAttribute('placeholder', 'Défaut de l’organisation : 30');
    await expect(
      dialog.getByLabel('Début de la facturation (UTC)'),
    ).toBeVisible();
    await expect(dialog).toContainText('Fournisseur de paiement');
    await expect(dialog).toContainText('Prix de base');
    await expect(billing.summary()).toContainText(
      'La première facture est émise dès le démarrage de l’abonnement.',
    );
    // Beta has no billing e-mail: the notice is in French, with its field.
    await expect(billing.billingEmailNotice()).toContainText(
      'Beta Industries n’a pas d’e-mail de facturation',
    );
    await expect(
      billing.billingEmailNotice().getByLabel('E-mail de facturation'),
    ).toBeVisible();

    await dialog
      .getByLabel('Début de la facturation (UTC)')
      .fill('2099-01-01T00:00');
    await dialog.getByLabel('Début de la facturation (UTC)').blur();
    await expect(dialog).toContainText(
      'La facturation ne peut pas démarrer dans le futur',
    );
  });

  test('a version that is not on sale says so in French', async ({ page }) => {
    await page.goto('/customers/instances/beta-lab/billing');

    await expect(page.getByTestId('subscribe-unavailable')).toContainText(
      'Cette instance utilise Preview v2027.1',
    );
    await expect(page.getByTestId('subscribe-unavailable')).toContainText(
      'peut faire l’objet d’un abonnement',
    );
  });
});

test.describe('the usage history, read in French', () => {
  test('the drawer, its period, its columns, its export and the retention it reaches before', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    await history.freezeTime();
    await startInLanguage(page, 'fr');
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await page.goto('/customers/instances/acme-production/entitlements');
    await page
      .getByRole('link', { name: 'Historique d’usage de API Calls' })
      .click();

    const drawer = history.drawer();
    await expect(drawer).toContainText('Historique d’usage');
    await expect(drawer).toContainText(
      'API Calls sur Acme Production : tous les rapports acceptés pour ce compteur',
    );
    await expect(drawer).toContainText('Période (UTC)');
    await expect(drawer).toContainText(
      'Sans période, les 30 derniers jours sont affichés',
    );
    for (const column of [
      'Rapport',
      'Reçu le',
      'Mode',
      'Valeur',
      'Compteur',
      'Variation',
      'Limite',
    ]) {
      await expect(
        drawer.getByRole('columnheader', { exact: true, name: column }),
      ).toBeVisible();
    }
    await expect(history.rows()).toHaveCount(100);
    await expect(drawer.getByRole('row').nth(1)).toContainText('Ajout');
    await expect(drawer.getByText('Limite modifiée')).toBeVisible();
    await expect(
      drawer.getByRole('button', { name: 'Exporter en CSV' }),
    ).toBeVisible();
    await drawer
      .getByRole('button', { name: 'Charger plus de rapports' })
      .click();
    await expect(history.rows()).toHaveCount(130);

    await drawer.getByLabel('Du', { exact: true }).fill('2025-01-01');

    await expect(history.outsideRetention()).toContainText(
      'Au-delà de votre rétention de 18 mois',
    );
    await expect(history.outsideRetention()).toContainText(
      /L’usage antérieur au .+ n’est plus conservé\./,
    );
    await expect(
      history
        .outsideRetention()
        .getByRole('button', { name: /^Afficher à partir du / }),
    ).toBeVisible();
  });
});

test.describe('a customer and the settings of billing, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-07T12:00:00.000Z'));
    await startInLanguage(page, 'fr');
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('the billing e-mail and the invoices of a customer', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await page.goto('/customers/acme-corp');

    await expect(detail.detailsRow('E-mail de facturation')).toContainText(
      'ap@acme.com',
    );
    await expect(detail.invoiceRows('Factures')).toHaveCount(4);
    await expect(
      page.getByText('Les factures de toutes les instances de ce client'),
    ).toBeVisible();

    await page.goto('/customers/beta-industries');

    await expect(detail.detailsRow('E-mail de facturation')).toContainText(
      'Non renseigné',
    );
    await expect(page.getByTestId('customer-invoices-empty')).toContainText(
      'Aucune instance de ce client n’a encore été facturée.',
    );
  });

  test('the billing e-mail field of the form, and what it refuses', async ({
    page,
  }) => {
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await page.goto('/customers/new');
    await page.getByLabel('E-mail de facturation').fill('pas une adresse');
    await page.getByLabel('E-mail de facturation').blur();

    await expect(
      page.getByText(
        'Saisissez une adresse e-mail valide, par exemple facturation@acme.com',
      ),
    ).toBeVisible();
  });

  test('the settings of billing and the export of the data', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);

    await page.goto('/settings/billing');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Facturation' }),
    ).toBeVisible();
    await expect(settings.providers()).toContainText('Transmission manuelle');
    await expect(settings.providers()).toContainText('Rien à connecter.');
    await expect(settings.defaults()).toContainText(
      'Valeurs par défaut des abonnements',
    );
    await expect(
      settings.defaults().getByLabel(/Délai de paiement \(jours\)/),
    ).toHaveValue('30');
    await expect(settings.collectionMethod()).toContainText(
      'Envoyer la facture',
    );
    await settings.collectionMethod().click();
    await expect(
      page.getByRole('option', {
        name: 'Prélever automatiquement (nécessite un fournisseur de paiement)',
      }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      settings
        .defaults()
        .getByRole('button', { name: 'Enregistrer les valeurs par défaut' }),
    ).toBeVisible();
    await expect(settings.retention()).toContainText(
      'Les rapports d’usage sont conservés 18 mois.',
    );

    await page.goto('/settings');

    await expect(settings.linkCard()).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Ouvrir les réglages de facturation' }),
    ).toBeVisible();
    await expect(settings.exportCard()).toContainText('Exportez vos données');
    await expect(settings.invoicesExport()).toContainText(
      'Toutes les factures de l’organisation',
    );
    await expect(settings.usageExport()).toContainText(
      'Kaiten conserve 18 mois d’usage.',
    );
    // The months as French writes them.
    const months = settings
      .usageExport()
      .getByRole('list', { name: 'Mois d’usage' })
      .getByRole('listitem');
    await expect(months.first()).toContainText('octobre 2026');
    await expect(months.last()).toContainText('avril 2025');
  });
});

test.describe('the refusals to delete, read in French', () => {
  test('an instance that bills says what keeps it, in French, with the explanation of the API as it came', async ({
    page,
  }) => {
    await startInLanguage(page, 'fr');
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await page.goto('/customers/instances/acme-legacy');
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();

    const refusal = page.getByRole('dialog', {
      name: 'Cette instance ne peut pas être supprimée',
    });
    await expect(refusal).toContainText(
      'L’abonnement est terminé, mais certaines de ses factures ne sont pas réglées.',
    );
    await expect(refusal).toContainText('1 facture non réglée');
    await expect(refusal).toContainText('Réglez-les une à une');
    // What the API wrote stays in its words.
    await expect(refusal).toContainText('is billed: cancel its subscription');
  });
});
