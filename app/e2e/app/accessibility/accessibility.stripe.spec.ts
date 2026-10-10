import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { CustomerPaymentMethodDriver } from '../_support/drivers/customer-payment-method.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { StripeConnectorDriver } from '../_support/drivers/stripe-connector.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installConnectorAppMocks } from '../_support/mocks/install-connector-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { BILLED_NOW } from '../billing/billed-instances';
import { createLifecycleStripeModels } from '../billing/lifecycle-world';
import { createStripeBillingModel } from '../billing/billing.scenarios';
import { createStripeConnectorModels } from '../connectors/connectors.scenarios';
import { createStripeCustomersModels } from '../customers/customers.scenarios';

// The screens of Stripe as a person who cannot use a mouse or a screen meets them: no
// violation on the page in either theme, each dialog keeping the focus inside while it is
// open and closing on Escape, and a refusal announced where it is shown.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
});

test.describe('accessibility of the Stripe connector', () => {
  const install = async (
    page: Parameters<typeof installBillingAppMocks>[0],
    models: ReturnType<typeof createStripeConnectorModels>,
  ) => {
    await installBillingAppMocks(page, models.billing);
    await installConnectorAppMocks(page, models.connectors);
  };

  test('the page of a connected connector has no WCAG A/AA violations, in either theme', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await expect(stripe.modeBadge()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the page of one that is not connected yet, with the key to type, has none either', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'available' }));

    await stripe.goto();
    await stripe.keyField().fill('rk_live_abc123');
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the page of one that cannot be connected, with the reason, has none', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      createStripeConnectorModels({ standing: 'vaultMissing' }),
    );

    await stripe.goto();
    await expect(stripe.unavailable()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the tile among the connectors has none, whether it says it is connected or why it is not', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      createStripeConnectorModels({ standing: 'notEntitled' }),
    );

    await stripe.gotoIndex();
    await expect(stripe.tile()).toContainText('Not included in your plan');
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('a key Stripe rejected is announced on its field, which is marked invalid', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.saveKey('rk_test_rejected1');

    await expect(stripe.keyField()).toHaveAttribute('aria-invalid', 'true');
    await expect(stripe.keyField()).toHaveAttribute('aria-describedby', /.+/);
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the confirmation of the disconnection is an accessible dialog, with the refusal in it', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.openDisconnect();
    await stripe.confirmDisconnect().click();
    await expect(stripe.disconnectRefusal()).toBeVisible();

    await expectDialogAccessible(page, stripe.disconnectDialog());
  });
});

test.describe('accessibility of the settings of billing where Stripe is connected', () => {
  test('the card of the providers and the health that needs attention have no violations, in either theme', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({ sync: 'failing' }),
    );

    await settings.goto();
    await expect(settings.tiles()).toBeVisible();
    await expect(settings.stripeSync()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the health with nothing to attend to has none', async ({ page }) => {
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

    await settings.goto();
    await expect(settings.allClear()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('a refusal to sync is announced above the tiles', async ({ page }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.armProblem('syncBillingProvider', {
      code: 'SyncProvider.ProviderUnavailable',
      detail: 'the payment provider could not be reached',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await settings.goto();
    await settings.syncNowButton().click();

    await expect(settings.health().getByRole('alert')).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });
});

test.describe('accessibility of an invoice that Stripe collects', () => {
  for (const [id, what] of [
    ['inv-s1', 'one Stripe holds open, with the pages it hosts'],
    ['inv-mm', 'one whose amounts differ from those of Stripe'],
    ['inv-f1', 'one whose push failed'],
    ['inv-rv', 'a draft Stripe holds for review'],
    ['inv-pf', 'one whose automatic charge needs the customer'],
  ] as const) {
    test(`${what} has no WCAG A/AA violations, in either theme`, async ({
      page,
    }) => {
      const invoice = new InvoiceDetailDriver(page);
      await installBillingAppMocks(page, createStripeBillingModel());

      await invoice.goto(id);
      await expect(invoice.provider()).toBeVisible();
      await settle(page);
      await expectNoAccessibilityViolations(page);

      await useLightTheme(page);
      await expectNoAccessibilityViolations(page);
    });
  }

  test('the dialog that voids an invoice Stripe reports paid, when it could not read the payment, is accessible', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createStripeBillingModel();
    model.invoices.armProblem('syncInvoice', {
      code: 'SyncInvoice.ProviderUnavailable',
      detail: 'the payment provider could not be reached',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-pp');
    await invoice.action('Void').click();
    await invoice.confirmWithReason('Void invoice', 'wrong amount');
    await expect(invoice.voidPaidAtProvider()).toBeVisible();

    await expectDialogAccessible(page, invoice.dialog());
  });
});

test.describe('accessibility of the provider and the terms of a contract', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
  });

  test('the dialog, with the invoices still open and a warning, is accessible', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const models = createLifecycleStripeModels({ billingEmail: null });
    await installInstanceAppMocks(page, models.instances);
    await installBillingAppMocks(page, models.billing);

    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');
    await lifecycle.chooseProvider('Stripe');
    await expect(lifecycle.termsWarning()).toBeVisible();
    await expect(lifecycle.openInvoices()).toBeVisible();

    await expectDialogAccessible(page, lifecycle.dialog());
  });

  test('the dialog, where Stripe is offered and not connected yet, is accessible', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const models = createLifecycleStripeModels({ standing: 'available' });
    await installInstanceAppMocks(page, models.instances);
    await installBillingAppMocks(page, models.billing);

    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');
    await expect(lifecycle.connectStripeHint()).toBeVisible();

    await expectDialogAccessible(page, lifecycle.dialog());
  });
});

test.describe('accessibility of the payment method of a customer', () => {
  const install = async (
    page: Parameters<typeof installBillingAppMocks>[0],
    models: ReturnType<typeof createStripeCustomersModels>,
  ) => {
    await installCustomerAppMocks(page, models.customers);
    await installBillingAppMocks(page, models.billing);
  };

  for (const [slug, what] of [
    ['acme-corp', 'a card that works'],
    ['beta-industries', 'none on file'],
  ] as const) {
    test(`the card with ${what} has no WCAG A/AA violations, in either theme`, async ({
      page,
    }) => {
      const method = new CustomerPaymentMethodDriver(page);
      await install(page, createStripeCustomersModels());

      await method.goto(slug);
      await expect(method.summary()).toBeVisible();
      await settle(page);
      await expectNoAccessibilityViolations(page);

      await useLightTheme(page);
      await expectNoAccessibilityViolations(page);
    });
  }

  test('a card that expired and one a charge refused have none either', async ({
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
    models.billing.providers.setPaymentMethod('beta-industries', {
      attachedAt: '2024-05-01T09:00:00.000Z',
      brand: 'visa',
      expMonth: 3,
      expYear: 2030,
      last4: '1111',
      status: 'FAILED',
    });
    await install(page, models);

    for (const slug of ['acme-corp', 'beta-industries']) {
      await method.goto(slug);
      await expect(method.summary()).toContainText(
        /Expired|Last charge failed/,
      );
      await settle(page);
      await expectNoAccessibilityViolations(page);
    }
  });

  test('the confirmation of the removal, with the refusal in it, is an accessible dialog', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await method.goto('acme-corp');
    await method.remove().click();
    await method
      .removeDialog()
      .getByRole('button', { exact: true, name: 'Remove' })
      .click();
    await expect(method.removeRefusal()).toBeVisible();

    await expectDialogAccessible(page, method.removeDialog());
  });

  test('the dialog that asks the currency is accessible', async ({ page }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await method.goto('gamma-labs');
    await method.add().click();
    await expect(method.currencyDialog()).toBeVisible();

    await expectDialogAccessible(page, method.currencyDialog());
  });

  test('the panel that says a method was not saved has none', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const models = createStripeCustomersModels();
    models.billing.providers.setSession('cs_open', {
      customerSlug: 'beta-industries',
      outcome: 'incomplete',
    });
    await install(page, models);

    await page.goto('/customers/beta-industries?kaiten_setup_session=cs_open');
    await expect(method.setupFailed()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });
});
