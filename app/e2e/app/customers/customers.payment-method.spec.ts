import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { CustomerPaymentMethodDriver } from '../_support/drivers/customer-payment-method.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { BILLED_NOW } from '../billing/billed-instances';
import { createStripeCustomersModels } from './customers.scenarios';

// The payment method of a customer is the card Stripe charges for the contracts that
// collect automatically. Kaiten keeps its labels (brand, last four digits, expiry) and
// never the number: adding or replacing one sends the browser to a page Stripe hosts, and
// the customer comes back to their page with the session in the address, which the console
// checks with the API before it drops it. The card is there only where Stripe is connected.
// The page is frozen at `BILLED_NOW`, so that "expires soon" is the same whatever day it runs.

const SESSIONS = /\/api\/customers\/[^/]+\/billing\/payment-method-session$/;
const COMPLETIONS =
  /\/api\/customers\/[^/]+\/billing\/payment-method-session\/[^/]+\/complete$/;
const DETACHES = /\/api\/customers\/[^/]+\/billing\/payment-method$/;
const PORTALS = /\/api\/customers\/[^/]+\/billing\/portal-session$/;
const ORIGIN = 'http://127.0.0.1:3100';

type Models = ReturnType<typeof createStripeCustomersModels>;

async function install(
  page: Parameters<typeof installBillingAppMocks>[0],
  models: Models,
) {
  await installCustomerAppMocks(page, models.customers);
  await installBillingAppMocks(page, models.billing);
}

const visa = (overrides: Record<string, unknown> = {}) => ({
  attachedAt: '2026-02-10T09:00:00.000Z',
  brand: 'visa',
  expMonth: 12,
  expYear: 2030,
  last4: '4242',
  status: 'ACTIVE' as const,
  ...overrides,
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
  await new CustomerPaymentMethodDriver(page).standInForStripe();
});

test.describe('the payment method of a customer', () => {
  test('is the labels of the card Stripe holds: its brand and last four digits, when it expires, and where it stands', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await method.goto('acme-corp');

    await expect(method.card()).toContainText('Payment method');
    await expect(method.summary()).toHaveAttribute('data-standing', 'active');
    await expect(method.summary()).toContainText('Visa ending in 4242');
    await expect(method.summary()).toContainText('Active');
    await expect(method.summary()).toContainText('Expires 12/2030');
    await expect(method.inStripe()).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/test/customers/cus_acme',
    );
    await expect(method.replace()).toBeVisible();
    await expect(method.remove()).toBeVisible();
    await expect(method.portal()).toBeVisible();
  });

  test('says there is none for a customer Stripe knows and that has saved none, and offers to add one', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await method.goto('beta-industries');

    await expect(method.summary()).toHaveAttribute('data-standing', 'none');
    await expect(method.summary()).toContainText('No payment method on file');
    await expect(method.add()).toBeVisible();
    await expect(method.replace()).toHaveCount(0);
    await expect(method.remove()).toHaveCount(0);
  });

  test('says there is none for a customer that has never been to Stripe, with no portal to open', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await method.goto('gamma-labs');

    await expect(method.summary()).toContainText('No payment method on file');
    await expect(method.add()).toBeVisible();
    await expect(method.portal()).toHaveCount(0);
    await expect(method.inStripe()).toHaveCount(0);
  });

  test('says a card expires soon, a card that expired, and one that a charge said can no longer be used', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const models = createStripeCustomersModels();
    models.billing.providers.setPaymentMethod(
      'acme-corp',
      visa({ expMonth: 10, expYear: 2026 }),
    );
    await install(page, models);

    await method.goto('acme-corp');
    await expect(method.summary()).toContainText('Expires soon');

    // Each state in turn, read afresh from Stripe.
    for (const [status, badge, sentence] of [
      [
        'EXPIRED',
        'Expired',
        'This card has expired. Stripe cannot charge it: save another one.',
      ],
      [
        'FAILED',
        'Last charge failed',
        'A charge said this card can no longer be used. Save another one.',
      ],
    ] as const) {
      const other = createStripeCustomersModels();
      other.billing.providers.setPaymentMethod(
        'acme-corp',
        visa({ expMonth: 3, expYear: 2026, status }),
      );
      const fresh = await page.context().newPage();
      await fresh.clock.setFixedTime(new Date(BILLED_NOW));
      const there = new CustomerPaymentMethodDriver(fresh);
      await install(fresh, other);
      await there.goto('acme-corp');

      await expect(there.summary()).toHaveAttribute(
        'data-standing',
        status.toLowerCase(),
      );
      await expect(there.summary()).toContainText(badge);
      await expect(there.summary()).toContainText(sentence);
      await fresh.close();
    }
  });

  test('is not there where Stripe is not connected', async ({ page }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels({ standing: 'available' }));

    await method.goto('acme-corp');

    await expect(method.card()).toHaveCount(0);
  });

  test('can be read and not changed by a session that may only read billing', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await install(page, createStripeCustomersModels());

    await method.goto('acme-corp');

    await expect(method.summary()).toContainText('Visa ending in 4242');
    await expect(method.card().getByRole('button')).toHaveCount(0);
  });
});

test.describe('saving a payment method on the page Stripe hosts', () => {
  test('sends the customer there with the address of their page to come back to, and keeps no card', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const sessions = recordWrites(page, SESSIONS, ['POST']);
    await install(page, createStripeCustomersModels());

    await method.goto('beta-industries');
    await method.add().click();

    await page.waitForURL('https://checkout.stripe.com/c/pay/cs_test_0001');
    expect(sessions).toEqual([
      {
        body: { returnUrl: `${ORIGIN}/customers/beta-industries` },
        method: 'POST',
        pathname:
          '/api/customers/beta-industries/billing/payment-method-session',
      },
    ]);
  });

  test('asks the API to check the session when the customer comes back, shows the card it saved and drops the session from the address', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const completions = recordWrites(page, COMPLETIONS, ['POST']);
    const models = createStripeCustomersModels();
    models.billing.providers.setSession('cs_test_123', {
      customerSlug: 'beta-industries',
      outcome: 'complete',
    });
    await install(page, models);

    await page.goto(
      '/customers/beta-industries?kaiten_setup_session=cs_test_123',
    );

    await expectToast(page, 'Payment method saved');
    expect(completions).toEqual([
      {
        body: null,
        method: 'POST',
        pathname:
          '/api/customers/beta-industries/billing/payment-method-session/cs_test_123/complete',
      },
    ]);
    await expect(method.summary()).toContainText('Visa ending in 4242');
    await expect(method.summary()).toContainText('Active');
    await expect(page).toHaveURL(/\/customers\/beta-industries$/);

    // A reload does not ask again: the session is no longer in the address.
    await page.reload();
    await expect(method.summary()).toContainText('Visa ending in 4242');
    expect(completions).toHaveLength(1);
  });

  test('goes there and back: the card is saved by the session the customer was sent with', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    await install(page, createStripeCustomersModels());

    await method.goto('beta-industries');
    await method.add().click();
    await page.waitForURL('https://checkout.stripe.com/c/pay/cs_test_0001');
    await page.goto(
      '/customers/beta-industries?kaiten_setup_session=cs_test_0001',
    );

    await expectToast(page, 'Payment method saved');
    await expect(method.summary()).toContainText('Visa ending in 4242');
  });

  test('replaces the card with the one the customer saved', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const models = createStripeCustomersModels();
    models.billing.providers.setSession('cs_new', {
      customerSlug: 'acme-corp',
      outcome: 'complete',
      paymentMethod: {
        brand: 'mastercard',
        expMonth: 1,
        expYear: 2031,
        last4: '4444',
      },
    });
    await install(page, models);
    await method.goto('acme-corp');
    await expect(method.summary()).toContainText('Visa ending in 4242');

    await page.goto('/customers/acme-corp?kaiten_setup_session=cs_new');

    await expect(method.summary()).toContainText('Mastercard ending in 4444');
    await expect(method.summary()).toContainText('Expires 01/2031');
    await expect(method.summary()).not.toContainText('4242');
  });

  test('says the card was not saved when the customer left the page of Stripe without one, and checks again when asked', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const completions = recordWrites(page, COMPLETIONS, ['POST']);
    const models = createStripeCustomersModels();
    models.billing.providers.setSession('cs_open', {
      customerSlug: 'beta-industries',
      outcome: 'incomplete',
    });
    await install(page, models);

    await page.goto('/customers/beta-industries?kaiten_setup_session=cs_open');

    await expect(method.setupFailed()).toContainText(
      'the customer has not finished saving a payment method on the provider page',
    );
    await expect(method.setupFailed()).toContainText(
      'The payment method was not saved.',
    );
    await expect(method.summary()).toContainText('No payment method on file');
    // The session is out of the address, so that a reload does not ask again.
    await expect(page).toHaveURL(/\/customers\/beta-industries$/);
    await method
      .setupFailed()
      .getByRole('button', { name: 'Check again' })
      .click();

    await expect.poll(() => completions.length).toBe(2);
    expect(completions[1].pathname).toBe(completions[0].pathname);
  });

  test('asks which currency it is set up in when the customer has no contract to take it from', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const sessions = recordWrites(page, SESSIONS, ['POST']);
    await install(page, createStripeCustomersModels());

    await method.goto('gamma-labs');
    await method.add().click();

    await expect(method.currencyDialog()).toBeVisible();
    expect(sessions).toHaveLength(1);
    await method
      .currencyDialog()
      .getByRole('button', { name: 'Pick a currency' })
      .click();
    await page.getByRole('option', { exact: true, name: 'USD' }).click();
    await method
      .currencyDialog()
      .getByRole('button', { name: 'Continue to Stripe' })
      .click();

    await page.waitForURL('https://checkout.stripe.com/c/pay/cs_test_0001');
    expect(sessions).toHaveLength(2);
    expect(sessions[0].body).toEqual({
      returnUrl: `${ORIGIN}/customers/gamma-labs`,
    });
    expect(sessions[1].body).toEqual({
      currency: 'USD',
      returnUrl: `${ORIGIN}/customers/gamma-labs`,
    });
  });

  test('shows a Stripe that cannot be reached as nothing changed, and goes on when it is asked again', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const models = createStripeCustomersModels();
    models.billing.providers.armProblem('createPaymentMethodSession', {
      code: 'CreatePaymentMethodSession.ProviderUnavailable',
      detail: 'the payment provider could not be reached',
      status: 503,
    });
    await install(page, models);

    await method.goto('beta-industries');
    await method.add().click();

    const alert = method.card().getByRole('alert');
    await expect(alert).toContainText(
      'The payment provider could not be reached. Nothing was changed.',
    );
    await alert.getByRole('button', { name: 'Retry' }).click();

    await page.waitForURL('https://checkout.stripe.com/c/pay/cs_test_0001');
  });
});

test.describe('the portal of Stripe', () => {
  test('is opened with the address of the page to come back to, for a customer Stripe knows', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const portals = recordWrites(page, PORTALS, ['POST']);
    await install(page, createStripeCustomersModels());

    await method.goto('acme-corp');
    await method.portal().click();

    await page.waitForURL('https://billing.stripe.com/p/session/bps_cus_acme');
    expect(portals).toEqual([
      {
        body: { returnUrl: `${ORIGIN}/customers/acme-corp` },
        method: 'POST',
        pathname: '/api/customers/acme-corp/billing/portal-session',
      },
    ]);
  });

  test('says Stripe is not connected, in the words of the API and with the way to its connector, when it is refused', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const models = createStripeCustomersModels();
    models.billing.providers.armProblem('createPortalSession', {
      code: 'CreatePortalSession.ProviderNotConnected',
      detail:
        'no payment provider that saves payment methods is connected for this organization',
      status: 422,
    });
    await install(page, models);

    await method.goto('acme-corp');
    await method.portal().click();

    const alert = method.card().getByRole('alert');
    await expect(alert).toContainText(
      'no payment provider that saves payment methods is connected for this organization',
    );
    await expect(
      alert.getByRole('link', { name: 'Open the Stripe connector' }),
    ).toHaveAttribute('href', '/integrations/connectors/stripe');
    await expect(page).toHaveURL(/\/customers\/acme-corp$/);
  });
});

test.describe('removing the payment method', () => {
  test('asks first, sends nothing when it is given up, and removes the card when it is confirmed', async ({
    page,
  }) => {
    const method = new CustomerPaymentMethodDriver(page);
    const detaches = recordWrites(page, DETACHES, ['DELETE']);
    const models = createStripeCustomersModels();
    models.billing.providers.setPaymentMethod('beta-industries', visa());
    await install(page, models);

    await method.goto('beta-industries');
    await method.remove().click();
    await expect(method.removeDialog()).toContainText(
      'Remove the payment method?',
    );
    await method.removeDialog().getByRole('button', { name: 'Cancel' }).click();
    await expect(method.removeDialog()).toHaveCount(0);
    expect(detaches).toHaveLength(0);

    await method.remove().click();
    await method
      .removeDialog()
      .getByRole('button', { exact: true, name: 'Remove' })
      .click();

    await expectToast(page, 'Payment method removed');
    expect(detaches).toEqual([
      {
        body: null,
        method: 'DELETE',
        pathname: '/api/customers/beta-industries/billing/payment-method',
      },
    ]);
    await expect(method.summary()).toContainText('No payment method on file');
    await expect(method.removeDialog()).toHaveCount(0);
  });

  test('is refused while a live contract is charged automatically, and the dialog stays on what to do first', async ({
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

    await expect(method.removeRefusal()).toContainText(
      'a live subscription of the customer is charged automatically: switch it to SEND_INVOICE first',
    );
    await expect(method.removeRefusal()).toContainText(
      'Switch the contracts of this customer that are charged automatically to sending the invoice, in the Billing tab of their instance, then remove the payment method.',
    );
    await method.removeDialog().getByRole('button', { name: 'Cancel' }).click();
    // Nothing was removed.
    await expect(method.summary()).toContainText('Visa ending in 4242');
  });
});
