import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import { expectNoHorizontalScroll } from '../_support/assertions/layout';
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
import { createStripeBillingModel } from '../billing/billing.scenarios';
import { createLifecycleStripeModels } from '../billing/lifecycle-world';
import { createStripeConnectorModels } from '../connectors/connectors.scenarios';
import { createStripeCustomersModels } from '../customers/customers.scenarios';

// The narrowest phone the screens of Stripe are checked at, as for the rest of billing:
// the page keeps the width of the screen, a card is wholly on it, a button that does not
// fit beside another goes under it, and a dialog is as wide as the screen and no wider.
const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
});

/** The element is wholly on the screen: neither of its sides is cut off. */
async function expectWithinScreen(element: Locator) {
  const box = await element.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
}

test.describe('the Stripe connector, on the narrowest phone', () => {
  const install = async (
    page: Parameters<typeof installBillingAppMocks>[0],
    models: ReturnType<typeof createStripeConnectorModels>,
  ) => {
    await installBillingAppMocks(page, models.billing);
    await installConnectorAppMocks(page, models.connectors);
  };

  test('the page keeps the width of the screen, with its key, its options and its button on it', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(stripe.settings());
    await expectWithinScreen(stripe.keyField());
    await expectWithinScreen(stripe.taxBehavior());
    await stripe.keyField().fill('rk_test_123');
    await stripe.saveButton('Save changes').scrollIntoViewIfNeeded();
    await expectWithinScreen(stripe.saveButton('Save changes'));
  });

  test('the reason it cannot be connected fits, with the link to the settings it names', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      createStripeConnectorModels({ standing: 'vaultMissing' }),
    );

    await stripe.goto();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(stripe.unavailable());
    await expectWithinScreen(
      stripe.unavailable().getByRole('link', { name: 'Self-hosting settings' }),
    );
  });

  test('the confirmation of the disconnection, with the refusal in it, fits the screen', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(page, createStripeConnectorModels({ standing: 'connected' }));

    await stripe.goto();
    await stripe.openDisconnect();
    await stripe.confirmDisconnect().click();
    await expect(stripe.disconnectRefusal()).toBeVisible();
    await settle(page);

    await expectWithinScreen(stripe.disconnectDialog());
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the tile among the connectors fits, with its note and its button', async ({
    page,
  }) => {
    const stripe = new StripeConnectorDriver(page);
    await install(
      page,
      createStripeConnectorModels({ standing: 'vaultMissing' }),
    );

    await stripe.gotoIndex();

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(stripe.tile());
  });
});

test.describe('the settings of billing where Stripe is connected, on the narrowest phone', () => {
  test('the providers and the health keep the width of the screen, with every tile of the health on it', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({ sync: 'failing' }),
    );

    await settings.goto();
    await expect(settings.tiles()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(settings.providers());
    await expectWithinScreen(settings.stripeSync());
    await expectWithinScreen(settings.health());
    await expectWithinScreen(settings.syncNowButton());
    for (const id of [
      'held',
      'pushFailures',
      'overdue',
      'handoff',
      'mismatches',
      'closeBacklog',
      'pastDue',
    ] as const) {
      await settings.tile(id).scrollIntoViewIfNeeded();
      await expectWithinScreen(settings.tile(id));
    }
  });
});

test.describe('an invoice that Stripe collects, on the narrowest phone', () => {
  test('keeps the width of the screen, with where it stands in Stripe, the pages it hosts and how its amounts compare', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-mm');
    await expect(invoice.reconciliation()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(invoice.provider());
    await expectWithinScreen(invoice.providerLinks());
    await expectWithinScreen(invoice.reconciliation());
  });

  test('folds what can be done to it into the menu, with the push and the read-back in it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-f1');
    await expect(invoice.pushError()).toBeVisible();
    await expectWithinScreen(invoice.pushError());
    await invoice.menu().click();

    await expect(
      page.getByRole('menuitem', { name: 'Retry push' }),
    ).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Void' })).toBeVisible();
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('says a draft is awaiting finalization, within the screen', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-rv');

    await expectWithinScreen(invoice.awaitingFinalization());
    await expectNoHorizontalScroll(page, WIDTH);
  });
});

test.describe('the provider and the terms of a contract, on the narrowest phone', () => {
  test('the dialog fits the screen, with the warning and the invoices still open it lists', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const models = createLifecycleStripeModels({ billingEmail: null });
    await billing.freezeTime();
    await installInstanceAppMocks(page, models.instances);
    await installBillingAppMocks(page, models.billing);

    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');
    await lifecycle.chooseProvider('Stripe');
    await expect(lifecycle.openInvoices()).toBeVisible();
    await settle(page);

    await expectWithinScreen(lifecycle.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await lifecycle.termsWarning().scrollIntoViewIfNeeded();
    await expectWithinScreen(lifecycle.termsWarning());
    await lifecycle.openInvoice('inv-h1').scrollIntoViewIfNeeded();
    await expectWithinScreen(lifecycle.openInvoice('inv-h1'));
  });
});

test.describe('the payment method of a customer, on the narrowest phone', () => {
  const install = async (
    page: Parameters<typeof installBillingAppMocks>[0],
    models: ReturnType<typeof createStripeCustomersModels>,
  ) => {
    await installCustomerAppMocks(page, models.customers);
    await installBillingAppMocks(page, models.billing);
  };

  test('keeps the width of the screen, its buttons going under one another rather than past the edge', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await method.goto('acme-corp');
    await expect(method.summary()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(method.card());
    for (const control of [
      method.replace(),
      method.portal(),
      method.remove(),
      method.inStripe(),
    ]) {
      await expectWithinScreen(control);
    }
  });

  test('the confirmation of the removal, with the refusal in it, fits the screen', async ({
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
    await settle(page);

    await expectWithinScreen(method.removeDialog());
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the dialog that asks the currency fits the screen', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await method.goto('gamma-labs');
    await method.add().click();
    await expect(method.currencyDialog()).toBeVisible();
    await settle(page);

    await expectWithinScreen(method.currencyDialog());
    await expectNoHorizontalScroll(page, WIDTH);
  });
});
