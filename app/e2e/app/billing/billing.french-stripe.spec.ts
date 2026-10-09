import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { CustomerPaymentMethodDriver } from '../_support/drivers/customer-payment-method.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { StripeConnectorDriver } from '../_support/drivers/stripe-connector.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installConnectorAppMocks } from '../_support/mocks/install-connector-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createStripeConnectorModels } from '../connectors/connectors.scenarios';
import { createStripeCustomersModels } from '../customers/customers.scenarios';
import { BILLED_NOW } from './billed-instances';
import { createStripeBillingModel } from './billing.scenarios';
import { createLifecycleStripeModels } from './lifecycle-world';

// The screens of Stripe read in French: the connector, where Stripe stands in the settings
// of billing and what needs attention, an invoice Stripe collects and what is done to it, the
// provider of a contract and the payment method of a customer. The console reads its language
// when it starts. What the API wrote, the words of a refusal or what Stripe answered, stays as
// it came, and no English word is left where a key would be missing.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
  await startInLanguage(page, 'fr');
});

test.describe('the Stripe connector, read in French', () => {
  const install = async (
    page: Parameters<typeof installBillingAppMocks>[0],
    models: ReturnType<typeof createStripeConnectorModels>,
  ) => {
    await installBillingAppMocks(page, models.billing);
    await installConnectorAppMocks(page, models.connectors);
  };

  test('the tile, and the page of a connected connector with its key that is never read back', async ({
    page,
  }) => {
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await page.goto('/integrations/connectors/stripe');

    const settings = page.getByTestId('stripe-settings');
    await expect(settings).toContainText('Connexion');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Stripe' }),
    ).toBeVisible();
    await expect(page.getByText('Mode test', { exact: true })).toBeVisible();
    const key = settings.getByLabel('Clé API restreinte');
    await expect(key).toHaveAttribute('type', 'password');
    await expect(key).toHaveAttribute(
      'placeholder',
      'Clé enregistrée (Mode test) — saisissez-en une nouvelle pour la remplacer',
    );
    await expect(settings).toContainText('Montants hors taxes');
    await expect(settings).toContainText('Calculer la taxe automatiquement');
    await expect(settings).toContainText(
      'Finaliser les factures automatiquement',
    );
    await expect(page.getByTestId('stripe-overview')).toContainText(
      'Qui fait quoi',
    );
    // The names of the permissions are the ones Stripe's dashboard gives them.
    await expect(page.getByTestId('stripe-permissions')).toContainText(
      'Invoices : écriture',
    );
  });

  test('a secret key is refused in French, and what Stripe rejected is the words of the API', async ({
    page,
  }) => {
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await page.goto('/integrations/connectors/stripe');
    const settings = page.getByTestId('stripe-settings');
    const key = settings.getByLabel('Clé API restreinte');
    await key.fill('sk_live_x');
    await key.blur();

    await expect(settings).toContainText(
      'Utilisez une clé restreinte (rk_…) : une clé secrète (sk_…)',
    );

    await key.fill('rk_test_rejected1');
    await settings
      .getByRole('button', { name: 'Enregistrer les modifications' })
      .click();

    await expect(settings).toContainText(
      'the payment provider refused the credentials: Invalid API Key provided',
    );
  });

  test('a connector that cannot be connected says why, with the way to the settings of the deployment', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      createStripeConnectorModels({ standing: 'vaultMissing' }),
    );

    await page.goto('/integrations/connectors');

    await expect(stripe.tile()).toContainText(
      'Stripe nécessite un Vault configuré',
    );
    await expect(stripe.tile()).toContainText('Indisponible');

    await page.goto('/integrations/connectors/stripe');
    await expect(stripe.unavailable()).toContainText(
      'Stripe nécessite un Vault configuré',
    );
    await expect(
      stripe.unavailable().getByRole('link', {
        name: 'Paramètres d’auto-hébergement',
      }),
    ).toBeVisible();
  });

  test('the disconnection is refused in the words of the API, with how many invoices are still in Stripe in French', async ({
    page,
  }) => {
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await page.goto('/integrations/connectors/stripe');
    await page
      .getByRole('button', { exact: true, name: 'Déconnecter' })
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Déconnecter Stripe ?');
    await dialog
      .getByRole('button', { exact: true, name: 'Déconnecter' })
      .click();

    await expect(dialog.getByTestId('stripe-disconnect-refused')).toContainText(
      'subscriptions or unsettled invoices still route to this payment provider',
    );
    await expect(dialog.getByTestId('stripe-routing')).toContainText(
      /\d+ factures non réglées sont encore dans Stripe\./,
    );
  });
});

test.describe('the settings of billing where Stripe is connected, read in French', () => {
  test('where Stripe stands and how its last pass went, and what needs attention', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setSyncState({
      consecutiveFailures: 3,
      lastSyncError: 'the payment provider could not be reached',
      lastSyncStatus: 'FAILED',
      lastSyncedAt: '2026-10-07T11:00:00.000Z',
    });
    model.providers.setHealth({
      closeBacklog: { count: 2, oldestDueAt: '2026-10-04T12:00:00.000Z' },
      handoff: {
        oldestPendingIssuedAt: '2026-09-27T12:00:00.000Z',
        pending: 4,
      },
      heldInvoices: {
        byReason: {
          LEDGER_CHAIN_BREAK: 0,
          LEDGER_COUNTER_MISMATCH: 0,
          LEDGER_SEQUENCE_GAP: 2,
        },
        count: 2,
      },
      overdueInvoices: 2,
      pastDueSubscriptions: 1,
      providerSync: [
        {
          consecutiveFailures: 3,
          lagSeconds: 3600,
          lastSyncError: 'the payment provider could not be reached',
          lastSyncStatus: 'FAILED',
          lastSyncedAt: '2026-10-07T11:00:00.000Z',
          providerKind: 'STRIPE',
        },
      ],
      pushFailures: { count: 1, oldestFailedAt: '2026-10-07T09:00:00.000Z' },
      reconciliationMismatches30d: 1,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/settings/billing');

    await expect(settings.stripe()).toContainText('Connecté');
    await expect(settings.stripe()).toContainText('Mode test');
    await expect(settings.stripe()).toContainText('Gérer la connexion');
    await expect(settings.stripeSync()).toContainText(
      '3 synchronisations de suite ont échoué. La dernière : il y a 1 heure.',
    );
    await expect(settings.stripeSync()).toContainText(
      'Dernière erreur : the payment provider could not be reached',
    );
    await expect(settings.health()).toContainText('Santé');
    await expect(settings.tile('held')).toContainText('Factures retenues');
    await expect(settings.tile('held')).toContainText(
      'Des rapports d’usage manquent dans le journal',
    );
    await expect(settings.tile('pushFailures')).toContainText(
      'La plus ancienne a échoué il y a 3 heures.',
    );
    await expect(settings.tile('handoff')).toContainText(
      'En attente de votre comptabilité',
    );
    await expect(settings.tile('handoff')).toContainText(
      'La plus ancienne a été émise il y a 10 jours.',
    );
    await expect(settings.tile('closeBacklog')).toContainText(
      'Périodes non clôturées',
    );
    await expect(settings.tile('pastDue')).toContainText(
      'Abonnements en retard de paiement',
    );
    await expect(
      settings
        .health()
        .getByRole('button', { name: 'Synchroniser maintenant' }),
    ).toBeVisible();
  });

  test('says it synced, in French, and that all is clear', async ({ page }) => {
    const settings = new BillingSettingsDriver(page);
    const writes = recordWrites(page, /\/api\/billing\/sync$/, ['POST']);
    const model = createStripeBillingModel();
    await installBillingAppMocks(page, model);

    await page.goto('/settings/billing');
    await settings
      .health()
      .getByRole('button', { name: 'Synchroniser maintenant' })
      .click();

    await expectToast(
      page,
      'Synchronisé avec le fournisseur de paiement : 5 factures mises à jour.',
    );
    expect(writes).toHaveLength(1);
    await expect(settings.stripeSync()).toHaveText(
      'Dernière synchronisation : maintenant.',
    );
  });

  test('says all is clear in French when nothing needs attention', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setHealth({
      closeBacklog: { count: 0 },
      handoff: { pending: 0 },
      heldInvoices: {
        byReason: {
          LEDGER_CHAIN_BREAK: 0,
          LEDGER_COUNTER_MISMATCH: 0,
          LEDGER_SEQUENCE_GAP: 0,
        },
        count: 0,
      },
      overdueInvoices: 0,
      pastDueSubscriptions: 0,
      providerSync: [],
      pushFailures: { count: 0 },
      reconciliationMismatches30d: 0,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/settings/billing');

    await expect(settings.allClear()).toContainText('Tout est en ordre');
  });

  test('Stripe is not connected: the way to connect it is in French', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({ standing: 'available' }),
    );

    await page.goto('/settings/billing');

    await expect(settings.stripe()).toContainText('Non connecté');
    await expect(
      settings.stripe().getByRole('link', { name: 'Connecter Stripe' }),
    ).toBeVisible();
  });
});

test.describe('an invoice that Stripe collects, read in French', () => {
  test('where it stands in Stripe, the pages Stripe hosts and how the amounts compare', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await page.goto('/billing/invoices/inv-mm');

    await expect(invoice.provider()).toContainText('Fournisseur de paiement');
    await expect(invoice.provider()).toContainText('Statut dans Stripe');
    await expect(invoice.provider()).toContainText('Ouverte');
    await expect(invoice.provider()).toContainText('Facture Stripe');
    await expect(invoice.provider()).toContainText(
      'Stripe envoie la facture au client et encaisse le paiement.',
    );
    await expect(
      invoice.providerLinks().getByRole('link', { name: 'Facture hébergée' }),
    ).toBeVisible();
    await expect(invoice.reconciliation()).toContainText('Rapprochement');
    await expect(invoice.reconciliation()).toContainText('Différents');
    await expect(invoice.reconciliation()).toContainText(
      'Total composé par Kaiten',
    );
    await expect(invoice.reconciliation()).toContainText(
      'Lignes de Stripe que Kaiten n’a pas composées',
    );
    // The amounts as French writes them.
    await expect(invoice.reconciliation()).toContainText(/33,19\s\$US/);
    await expect(invoice.reconciliation()).toContainText(/34,19\s\$US/);
  });

  test('a push that failed, a draft awaiting finalization and a charge that needs the customer', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await page.goto('/billing/invoices/inv-f1');
    await expect(invoice.pushError()).toContainText(
      'L’envoi à Stripe a échoué',
    );
    await expect(invoice.pushError()).toContainText('3 tentatives.');
    await expect(invoice.pushError()).toContainText('Prochaine tentative :');
    await expect(invoice.actionOf('retryPush')).toBeVisible();

    await page.goto('/billing/invoices/inv-rv');
    await expect(invoice.awaitingFinalization()).toContainText(
      'En attente de finalisation dans Stripe',
    );

    await page.goto('/billing/invoices/inv-pf');
    await expect(invoice.paymentError()).toContainText(
      'Stripe n’a pas pu encaisser le paiement',
    );
    await expect(invoice.paymentError()).toContainText(
      'Le client doit confirmer le paiement sur la page de la facture hébergée.',
    );
  });

  test('retrying the push says it is queued, in French, and then that Stripe has the invoice', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await page.clock.install({ time: new Date(BILLED_NOW) });
    await installBillingAppMocks(page, createStripeBillingModel());

    await page.goto('/billing/invoices/inv-f1');
    await invoice.actionOf('retryPush').click();

    await expectToast(
      page,
      'Envoi demandé. Kaiten vérifie à nouveau toutes les quelques secondes.',
    );
    await expect(invoice.pushStatus()).toContainText(
      'Envoi à Stripe en cours…',
    );
    await page.clock.runFor(5_000);

    await expectToast(page, 'Stripe a la facture');
  });

  test('voiding an invoice Stripe reports paid says it was not voided, in French, and reads the payment', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await page.goto('/billing/invoices/inv-pp');
    await invoice.actionOf('void').click();
    await expect(invoice.dialog()).toContainText(
      'La facture est d’abord annulée chez votre fournisseur de paiement',
    );
    await invoice
      .dialog()
      .getByLabel(/^Motif/)
      .fill('montant erroné');
    await invoice.confirm('Annuler la facture').click();

    await expectToast(
      page,
      'Facture non annulée : Stripe indique qu’elle est payée.',
    );
    await expectToast(page, 'Facture lue dans Stripe : elle est payée');
  });
});

test.describe('the provider of a contract, read in French', () => {
  test('the dialog, with Stripe, the warning and the invoices still open', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const models = createLifecycleStripeModels({ billingEmail: null });
    await billing.freezeTime();
    await installInstanceAppMocks(page, models.instances);
    await installBillingAppMocks(page, models.billing);

    await page.goto('/customers/instances/initech-prod/billing');
    await page
      .getByTestId('subscription-actions')
      .getByRole('link', { exact: true, name: 'Fournisseur et conditions' })
      .click();
    const dialog = lifecycle.dialog();
    await expect(
      dialog.getByRole('heading', {
        name: 'Fournisseur et conditions de Initech Production',
      }),
    ).toBeVisible();
    await expect(dialog).toContainText('Encaissé par');
    await dialog.getByRole('combobox', { name: /Encaissé par/ }).click();
    await page.getByRole('option', { exact: true, name: 'Stripe' }).click();

    await expect(lifecycle.termsWarning()).toContainText(
      'Ce client n’a pas d’e-mail de facturation, et Stripe y envoie les factures.',
    );
    await expect(dialog).toContainText(
      'Le changement prend effet à partir de la prochaine facture',
    );
    await expect(lifecycle.openInvoices()).toContainText(
      'Factures encore ouvertes',
    );
    await expect(lifecycle.openInvoice('inv-m1')).toContainText(
      'Prête à facturer',
    );
    await expect(lifecycle.openInvoice('inv-h1')).toContainText('Bloquée');
  });

  test('Stripe listed off where it is not connected yet, with the way to connect it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const models = createLifecycleStripeModels({ standing: 'available' });
    await billing.freezeTime();
    await installInstanceAppMocks(page, models.instances);
    await installBillingAppMocks(page, models.billing);

    await page.goto('/customers/instances/initech-prod/billing/terms');

    await expect(lifecycle.connectStripeHint()).toContainText(
      'Stripe n’est pas encore connecté pour votre organisation',
    );
    await expect(
      lifecycle
        .connectStripeHint()
        .getByRole('link', { name: 'Connecter Stripe' }),
    ).toBeVisible();
  });
});

test.describe('the payment method of a customer, read in French', () => {
  const install = async (
    page: Parameters<typeof installBillingAppMocks>[0],
    models: ReturnType<typeof createStripeCustomersModels>,
  ) => {
    await installCustomerAppMocks(page, models.customers);
    await installBillingAppMocks(page, models.billing);
  };

  test('the card, its states and its actions', async ({ page }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await page.goto('/customers/acme-corp');

    await expect(method.card()).toContainText('Moyen de paiement');
    await expect(method.summary()).toContainText('Visa se terminant par 4242');
    await expect(method.summary()).toContainText('Active');
    await expect(method.summary()).toContainText('Expire le 12/2030');
    await expect(
      method.card().getByRole('button', { name: 'Remplacer' }),
    ).toBeVisible();
    await expect(
      method.card().getByRole('button', { name: 'Gérer dans Stripe' }),
    ).toBeVisible();
    await expect(
      method.card().getByRole('link', { name: 'Ouvrir le client dans Stripe' }),
    ).toBeVisible();

    await page.goto('/customers/beta-industries');
    await expect(method.summary()).toContainText(
      'Aucun moyen de paiement enregistré',
    );
    await expect(
      method
        .card()
        .getByRole('button', { name: 'Ajouter un moyen de paiement' }),
    ).toBeVisible();
  });

  test('the removal is refused in the words of the API, with what to do first in French', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await page.goto('/customers/acme-corp');
    await method
      .card()
      .getByRole('button', { exact: true, name: 'Retirer' })
      .click();
    const dialog = method.removeDialog();
    await expect(dialog).toContainText('Retirer le moyen de paiement ?');
    await dialog.getByRole('button', { exact: true, name: 'Retirer' }).click();

    await expect(method.removeRefusal()).toContainText(
      'a live subscription of the customer is charged automatically',
    );
    await expect(method.removeRefusal()).toContainText(
      'Passez les contrats de ce client qui sont prélevés automatiquement à l’envoi de la facture',
    );
  });

  test('a card that expired, and the currency that is asked', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const models = createStripeCustomersModels();
    models.billing.providers.setPaymentMethod('acme-corp', {
      attachedAt: '2024-05-01T09:00:00.000Z',
      brand: 'mastercard',
      expMonth: 3,
      expYear: 2026,
      last4: '4444',
      status: 'EXPIRED',
    });
    await install(page, models);

    await page.goto('/customers/acme-corp');
    await expect(method.summary()).toContainText('Expirée');
    await expect(method.summary()).toContainText(
      'Cette carte a expiré. Stripe ne peut pas la prélever',
    );

    await page.goto('/customers/gamma-labs');
    await method
      .card()
      .getByRole('button', { name: 'Ajouter un moyen de paiement' })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Devise du moyen de paiement' }),
    ).toBeVisible();
  });
});
