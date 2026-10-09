import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createLifecycleStripeModels } from '../billing/lifecycle-world';

// Who collects the invoices of a contract, and how, is changed where its payment terms
// are: a dialog over the Billing tab that also names the provider once one is offered.
// A change takes effect from the next invoice, and the invoices still open keep their own
// provider and terms, which the dialog says one by one. Stripe is listed while it can be
// connected and offered only once it is; a contract cannot move to it for want of an
// address its invoices can be sent to, and the dialog says so before the API does.

const TERMS = /\/api\/instances\/[^/]+\/billing$/;
const INVOICE_WRITES = /\/api\/invoices\/[^/]+\/(void|recompose|release-hold)$/;

type Models = ReturnType<typeof createLifecycleStripeModels>;

async function install(
  page: Parameters<typeof installBillingAppMocks>[0],
  models: Models,
) {
  await installInstanceAppMocks(page, models.instances);
  await installBillingAppMocks(page, models.billing);
}

test.beforeEach(async ({ page }) => {
  await new InstanceBillingDriver(page).freezeTime();
});

test.describe('the provider of a contract, where Stripe is not connected yet', () => {
  test('lists Stripe off, with why and the way to connect it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await install(page, createLifecycleStripeModels({ standing: 'available' }));
    await billing.goto('initech-prod');

    await lifecycle.openProviderTerms('Initech Production');

    await expect(lifecycle.providerField()).toContainText('Manual hand-off');
    await lifecycle.providerField().click();
    await expect(
      page.getByRole('option', { name: 'Stripe (not connected)' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(lifecycle.connectStripeHint()).toContainText(
      'Stripe is not connected for your organization yet',
    );
    await expect(
      lifecycle
        .connectStripeHint()
        .getByRole('link', { name: 'Connect Stripe' }),
    ).toHaveAttribute('href', '/integrations/connectors/stripe');
    await expect(lifecycle.saveTermsButton()).toBeDisabled();
  });

  test('names the dialog by its payment terms where no provider is offered at all', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await install(
      page,
      createLifecycleStripeModels({ standing: 'vaultMissing' }),
    );
    await billing.goto('initech-prod');

    await lifecycle.openTerms('Initech Production');

    await expect(lifecycle.providerField()).toHaveCount(0);
    await expect(lifecycle.daysField()).toBeVisible();
  });

  test('leads to the connector only a session that may read the settings of the organization', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.sales);
    await install(page, createLifecycleStripeModels({ standing: 'available' }));
    await billing.goto('initech-prod');

    await lifecycle.openProviderTerms('Initech Production');

    await expect(lifecycle.connectStripeHint()).toBeVisible();
    await expect(lifecycle.connectStripeHint().getByRole('link')).toHaveCount(
      0,
    );
  });
});

test.describe('moving a contract to Stripe', () => {
  test('sends the provider and nothing else, says it takes effect from the next invoice, and shows Stripe as the provider', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    await install(page, createLifecycleStripeModels());
    await billing.goto('initech-prod');
    await expect(
      billing.row(billing.subscriptionCard(), 'Provider'),
    ).toContainText('Manual');

    await lifecycle.openProviderTerms('Initech Production');
    await lifecycle.chooseProvider('Stripe');

    await expect(lifecycle.dialog()).toContainText(
      'The change takes effect from the next invoice; invoices already issued keep their provider.',
    );
    await expect(lifecycle.termsWarning()).toHaveCount(0);
    await lifecycle.saveTermsButton().click();

    await expectToast(page, 'The payment terms are saved');
    expect(writes).toEqual([
      {
        body: { providerKind: 'STRIPE' },
        method: 'PATCH',
        pathname: '/api/instances/initech-prod/billing',
      },
    ]);
    await expect(lifecycle.dialog()).toHaveCount(0);
    await expect(
      billing.row(billing.subscriptionCard(), 'Provider'),
    ).toContainText('Stripe');
  });

  test('keeps Save off, and says why with the way to the customer, while the customer has no billing e-mail', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    await install(page, createLifecycleStripeModels({ billingEmail: null }));
    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');

    await lifecycle.chooseProvider('Stripe');

    await expect(lifecycle.termsWarning()).toContainText(
      'This customer has no billing e-mail, and Stripe sends the invoices there.',
    );
    await expect(
      lifecycle.termsWarning().getByRole('link', { name: 'Open the customer' }),
    ).toHaveAttribute('href', '/customers/initech');
    await expect(lifecycle.saveTermsButton()).toBeDisabled();
    expect(writes).toHaveLength(0);

    // Back on the organization's own system, there is nothing to say and nothing to hold back.
    await lifecycle.chooseProvider('Manual hand-off');
    await expect(lifecycle.termsWarning()).toHaveCount(0);
  });

  test('lists the invoices still open and what becomes of each, and moves none of them', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const terms = recordWrites(page, TERMS);
    const invoices = recordWrites(page, INVOICE_WRITES);
    await install(page, createLifecycleStripeModels());
    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');

    // Nothing is said of them while the contract stays where it is.
    await expect(lifecycle.openInvoices()).toHaveCount(0);
    await lifecycle.chooseProvider('Stripe');

    await expect(lifecycle.openInvoices()).toContainText('Invoices still open');
    const ready = lifecycle.openInvoice('inv-m1');
    await expect(ready).toHaveAttribute('data-fate', 'manual');
    await expect(ready).toContainText('Ready to bill');
    await expect(ready).toContainText(
      'it is settled only by marking it paid or writing it off',
    );
    await expect(ready).toContainText(
      'To move it: void it, then recompose it.',
    );
    const held = lifecycle.openInvoice('inv-h1');
    await expect(held).toHaveAttribute('data-fate', 'held');
    await expect(held).toContainText(
      'releasing it issues it under the provider it was composed for, and recomposing it uses the new provider.',
    );
    await expect(held).toContainText(
      'Release it to keep its provider, or recompose it to move it: choose deliberately.',
    );

    await lifecycle.saveTermsButton().click();

    await expectToast(page, 'The payment terms are saved');
    expect(terms).toHaveLength(1);
    expect(terms[0].body).toEqual({ providerKind: 'STRIPE' });
    // Only the contract moved: no invoice was voided, recomposed or released.
    expect(invoices).toHaveLength(0);
  });

  test('says a contract with no invoice open has nothing in flight', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await install(page, createLifecycleStripeModels());
    await billing.goto('initech-seats');
    await lifecycle.openProviderTerms('Initech Seats');

    await lifecycle.chooseProvider('Stripe');

    await expect(lifecycle.openInvoices()).toContainText(
      'This contract has no open invoice.',
    );
  });

  test('is a refusal of Stripe on the request, with what Stripe answered and the way to its connector, and nothing changed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const models = createLifecycleStripeModels();
    models.billing.subscriptions.armProblem('updateInstanceBilling', {
      code: 'UpdateInstanceBilling.ProviderRejected',
      detail:
        'the payment provider refused the customer: Invalid email address',
      errors: [
        {
          location: 'provider',
          message: 'provider error',
          value: {
            providerCode: 'email_invalid',
            providerParam: 'email',
            providerRequestId: 'req_1',
          },
        },
      ],
      status: 422,
    });
    await install(page, models);
    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');

    await lifecycle.chooseProvider('Stripe');
    await lifecycle.saveTermsButton().click();

    const alert = lifecycle.dialog().getByRole('alert');
    await expect(alert).toContainText(
      'the payment provider refused the customer: Invalid email address',
    );
    await expect(alert.getByTestId('provider-answer')).toHaveText(
      'Code: email_invalid · Field: email · Request: req_1',
    );
    await expect(
      alert.getByRole('link', { name: 'Open the Stripe connector' }),
    ).toHaveAttribute('href', '/integrations/connectors/stripe');
    // Still in the dialog, with what was chosen, and the contract did not move.
    await expect(lifecycle.providerField()).toContainText('Stripe');
    await lifecycle.dialog().getByRole('button', { name: 'Cancel' }).click();
    await expect(
      billing.row(billing.subscriptionCard(), 'Provider'),
    ).toContainText('Manual');
  });

  test('is a Stripe that cannot be reached, said as nothing changed, with a way to ask again that moves the contract', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    const models = createLifecycleStripeModels();
    models.billing.subscriptions.armProblem('updateInstanceBilling', {
      code: 'UpdateInstanceBilling.ProviderUnavailable',
      detail: 'the payment provider could not be reached',
      status: 503,
    });
    await install(page, models);
    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');

    await lifecycle.chooseProvider('Stripe');
    await lifecycle.saveTermsButton().click();

    const alert = lifecycle.dialog().getByRole('alert');
    await expect(alert).toContainText(
      'The payment provider could not be reached. Nothing was changed.',
    );
    await alert.getByRole('button', { name: 'Retry' }).click();

    await expectToast(page, 'The payment terms are saved');
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual({ providerKind: 'STRIPE' });
    await expect(
      billing.row(billing.subscriptionCard(), 'Provider'),
    ).toContainText('Stripe');
  });
});

test.describe('the collection method of a contract', () => {
  test('is offered as sending the invoice, and charging automatically listed for Stripe only', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await install(page, createLifecycleStripeModels());
    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');

    // On the organization's own system the card cannot be charged.
    await lifecycle.collectionField().click();
    await expect(
      page.getByRole('option', { name: 'Charge automatically (needs Stripe)' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    await lifecycle.chooseProvider('Stripe');
    await lifecycle.collectionField().click();
    await expect(
      page.getByRole('option', { name: 'Charge automatically' }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('warns, before anything is sent, that the customer has no payment method Stripe can charge', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    await install(page, createLifecycleStripeModels());
    await billing.goto('initech-prod');
    await lifecycle.openProviderTerms('Initech Production');

    await lifecycle.chooseProvider('Stripe');
    await lifecycle.collectionField().click();
    await lifecycle.pickOption('Charge automatically');

    await expect(lifecycle.termsWarning()).toContainText(
      'This customer has no payment method Stripe can charge.',
    );
    await expect(
      lifecycle.termsWarning().getByRole('link', { name: 'Open the customer' }),
    ).toHaveAttribute('href', '/customers/initech');
    // The API has the last word: it refuses, in its own words, on the field it is about.
    await lifecycle.saveTermsButton().click();

    await expect(lifecycle.collectionField()).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(lifecycle.dialog()).toContainText(
      'the customer has no usable payment method to charge',
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toEqual({
      collectionMethod: 'CHARGE_AUTOMATICALLY',
      providerKind: 'STRIPE',
    });
  });
});
