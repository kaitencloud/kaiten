import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { signInWithScopes } from '../_support/session-scopes';
import { STARTER_MONTHLY } from '../billing/billed-instances';
import { createSubscriptionsModel } from '../billing/billing.scenarios';
import { createBillingCustomersModel } from '../customers/customers.scenarios';
import { createBilledInstancesModel } from './instances.scenarios';

// Subscribing an instance is a route of its own over the Billing tab: the price
// to pin it to, the payment terms when they are not the organization's, and when
// billing starts when it is not now. It tells when the first invoice is issued and
// never how much. A refusal leaves it open with what was typed; success leads to
// the invoice of the first period.

const SUBSCRIPTION_WRITES = /\/api\/instances\/[^/]+\/billing$/;

test.describe('subscribing an instance', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('offers the active flat fees of the version, the default first, and nothing metered or retired', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('acme-legacy');

    await billing.openSubscribe();
    await billing.basePriceField().click();

    await expect(page.getByRole('option')).toHaveText([
      'Enterprise, monthly · $499.00/month · In advance',
      'Enterprise, annual · $4,990.00/year · In arrears',
    ]);
  });

  test('tells the provider and does not ask for it, and says what the terms of the organization are', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');

    await billing.openSubscribe();

    await expect(billing.dialog()).toContainText('Manual');
    await expect(billing.dialog()).toContainText(
      'Invoices are recorded here and handed to your ERP.',
    );
    await expect(billing.daysUntilDueField()).toHaveAttribute(
      'placeholder',
      'Organization default: 30',
    );
  });

  test('starts the subscription with the price alone, and leads to the invoice of the first period', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    // A price billed in advance: its invoice is issued with the subscription.
    await expect(billing.summary()).toContainText(
      'The first invoice is issued as soon as the subscription starts.',
    );
    await billing.confirmButton().click();

    await expect(billing.started()).toContainText('Subscription started');
    // The button that sent the form is gone with it: the keyboard is not left on nothing.
    await expect(billing.started()).toBeFocused();
    await expect(billing.started()).toContainText('Active');
    await expect(billing.started()).toContainText(
      'Oct 7, 2026, 12:00 PM – Nov 7, 2026, 12:00 PM (UTC)',
    );
    await expect(billing.started()).toContainText('Activation invoice:');
    await expect(billing.started()).toContainText('$29.00');
    // What went out is the price, who the invoices are for, and the trial said to
    // be none: the release has trials, and the license of this instance carries none,
    // so that nothing applies behind the back of the person who read the form.
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      body: {
        basePriceId: 'price-starter-monthly',
        providerKind: 'NOOP',
        trialDays: 0,
      },
      method: 'POST',
      pathname: '/api/instances/beta-staging/billing',
    });
    for (const member of [
      'collectionMethod',
      'addOns',
      'voucherCode',
      'daysUntilDue',
      'startAt',
    ]) {
      expect(writes[0].body, member).not.toHaveProperty(member);
    }

    await billing
      .started()
      .getByRole('link', { name: 'View the invoice' })
      .click();

    await expect(page).toHaveURL(/\/invoices\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Activation invoice',
    );
  });

  test('shows the subscription in the tab once the dialog is closed, and the invoice it issued in the list', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();
    await billing.confirmButton().click();
    await expect(billing.started()).toBeVisible();

    await billing.close();

    await expect(page).toHaveURL(
      /\/customers\/instances\/beta-staging\/billing$/,
    );
    await expect(billing.subscriptionCard()).toContainText('Active');
    await expect(billing.notSubscribed()).toHaveCount(0);
    await expect(billing.invoiceRows()).toHaveCount(1);
  });

  test('says the first invoice waits for the first period to close for a price billed in arrears, and when', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('acme-legacy');
    await billing.openSubscribe();

    await billing.chooseBasePrice(/Enterprise, annual/);

    await expect(billing.summary()).toContainText(
      'Nothing is invoiced until the first period closes: the first invoice is issued on Oct 7, 2027, 12:00 PM (UTC).',
    );
    // It says when and never how much: the console cannot compose an invoice.
    await expect(billing.summary()).not.toContainText('$');
    await billing.confirmButton().click();

    await expect(billing.started()).toContainText(
      'Nothing is invoiced yet: the first invoice is issued on Oct 7, 2027, 12:00 PM (UTC).',
    );
  });

  test('sends the terms and the start that were typed, which the subscription then shows as its own', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await billing.daysUntilDueField().fill('60');
    // A contract that began a week ago: inside the month before now that a monthly price allows.
    await billing.setStartAt('2026-09-30T09:30');
    await billing.confirmButton().click();

    await expect(billing.started()).toBeVisible();
    expect(writes[0].body).toEqual({
      basePriceId: 'price-starter-monthly',
      daysUntilDue: 60,
      providerKind: 'NOOP',
      startAt: '2026-09-30T09:30:00.000Z',
      trialDays: 0,
    });
    await billing.close();
    const card = billing.subscriptionCard();
    await expect(billing.row(card, 'Payment terms')).toContainText(
      'Payable within 60 days',
    );
    await expect(billing.row(card, 'Payment terms')).toContainText(
      'This contract',
    );
    // The start was typed with a time, so the period says the time too, in UTC.
    await expect(billing.row(card, 'Current period')).toContainText(
      'Sep 30, 2026, 9:30 AM – Oct 30, 2026, 9:30 AM (UTC)',
    );
  });

  test('is told before it is asked that a start is in the future or further back than a period', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await billing.setStartAt('2026-10-08T12:00');
    await expect(billing.dialog()).toContainText(
      'Billing cannot start in the future',
    );
    await billing.setStartAt('2026-08-01T12:00');
    await expect(billing.dialog()).toContainText(
      'Billing cannot start more than one billing period ago',
    );

    await expect(billing.confirmButton()).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  test('is told before it is asked that the payment terms are no number of days up to a year, and keeps what was typed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await billing.daysUntilDueField().fill('366');
    await billing.daysUntilDueField().blur();

    await expect(billing.daysUntilDueField()).toHaveValue('366');
    await expect(billing.dialog()).toContainText(
      'Enter a whole number of days, from 0 to 365',
    );
    await expect(billing.confirmButton()).toBeDisabled();
    expect(writes).toHaveLength(0);

    await billing.daysUntilDueField().fill('365');

    await expect(billing.dialog()).not.toContainText(
      'Enter a whole number of days, from 0 to 365',
    );
    await expect(billing.confirmButton()).toBeEnabled();
  });

  test('sends one request however often it is pressed', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await billing.confirmButton().dblclick();

    await expect(billing.started()).toBeVisible();
    expect(writes).toHaveLength(1);
    await expect(billing.dialog().getByRole('alert')).toHaveCount(0);
  });

  test('shows a refusal about a field on that field, in the words of the API, and keeps the dialog open with what was typed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('subscribeInstance', {
      code: 'SubscribeInstance.StartAtTooEarly',
      detail: 'startAt must be on or after 2026-09-07T12:00:00Z',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('beta-staging');
    await billing.openSubscribe();
    await billing.setStartAt('2026-09-20T09:30');

    await billing.confirmButton().click();

    await expect(billing.dialog()).toContainText(
      'startAt must be on or after 2026-09-07T12:00:00Z',
    );
    await expect(billing.startAtField()).toHaveValue('2026-09-20T09:30');
    await expect(billing.started()).toHaveCount(0);
    // Nothing was started, so it can be sent again, and goes through.
    await billing.setStartAt('2026-09-25T09:30');
    await billing.confirmButton().click();
    await expect(billing.started()).toBeVisible();
  });

  test('says in its own words that someone subscribed the instance in the meantime, keeps the dialog open, and shows that subscription behind it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const model = createSubscriptionsModel();
    // Someone subscribes the instance after the tab has read that it has none.
    model.subscriptions.subscribe('beta-staging', {
      basePriceId: STARTER_MONTHLY.id,
      providerKind: 'NOOP',
    });
    model.subscriptions.armProblem('getInstanceBilling', {
      code: 'GetInstanceBilling.NotFound',
      detail: 'instance "beta-staging" has no subscription',
      status: 404,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('beta-staging');
    await expect(billing.notSubscribed()).toBeVisible();
    await billing.openSubscribe();
    await billing.daysUntilDueField().fill('60');

    await billing.confirmButton().click();

    await expect(billing.dialog()).toContainText(
      'this instance already has a live subscription',
    );
    await expect(billing.daysUntilDueField()).toHaveValue('60');
    await expect(billing.started()).toHaveCount(0);
    // The tab has read again behind the dialog: closing it shows what the API holds.
    await expect(billing.notSubscribed()).toHaveCount(0);
    await billing.close();
    await expect(billing.subscriptionCard()).toBeVisible();
  });

  test('shows a refusal that is about no field above the buttons, and lets the person send again', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('subscribeInstance', {
      detail: 'The billing service is restarting',
      status: 503,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await billing.confirmButton().click();

    const alert = billing.dialog().getByRole('alert');
    await expect(alert).toContainText('The billing service is restarting');
    await expect(alert).toContainText(
      'Nothing was changed. You can try again.',
    );
    await expect(billing.started()).toHaveCount(0);
    await alert.getByRole('button', { name: 'Retry' }).click();

    await expect(billing.started()).toBeVisible();
  });

  test('names the scope when the session may not subscribe, in a banner', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('subscribeInstance', {
      code: 'Auth.MissingScope',
      detail: 'missing required scope: write:billing',
      status: 403,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await billing.confirmButton().click();

    await expect(billing.dialog()).toContainText('Missing access');
    await expect(billing.dialog()).toContainText('write:billing');
  });

  test('opens at its own address over the tab, and leads back to the tab when it is closed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await page.goto('/customers/instances/beta-staging/billing/subscribe');

    await expect(billing.dialog()).toBeVisible();
    await expect(billing.basePriceField()).toBeVisible();
    // The tab it stands over is where it was.
    await expect(billing.notSubscribed()).toBeVisible();

    await billing.close();

    await expect(billing.tab()).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(
      /\/customers\/instances\/beta-staging\/billing$/,
    );
    await expect(billing.notSubscribed()).toBeVisible();
  });

  test('refuses an instance whose version is not on sale before it can be tried, without a dialog to fill', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await page.goto('/customers/instances/beta-lab/billing/subscribe');

    await expect(
      billing.dialog().getByTestId('subscribe-unavailable'),
    ).toContainText('Preview v2027.1 is not published');
    await expect(billing.confirmButton()).toHaveCount(0);
  });

  test('closes back to the tab, with the escape key as with the button', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await page.keyboard.press('Escape');

    await expect(billing.dialog()).toHaveCount(0);
    await expect(page).toHaveURL(
      /\/customers\/instances\/beta-staging\/billing$/,
    );
    await expect(billing.notSubscribed()).toBeVisible();
  });
});

test.describe('the billing e-mail of the customer, in the dialog that subscribes', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createBilledInstancesModel());
    // The address is written to the customer, which is the customers' to answer.
    await installCustomerAppMocks(page, createBillingCustomersModel());
  });

  test('is asked for when the customer has none, and set without leaving the dialog or subscribing', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const customerWrites = recordWrites(page, /\/api\/customers\/[^/]+$/, [
      'PUT',
    ]);
    const subscriptionWrites = recordWrites(page, SUBSCRIPTION_WRITES, [
      'POST',
    ]);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();
    await expect(billing.billingEmailNotice()).toContainText(
      'Beta Industries has no billing e-mail',
    );

    await billing.billingEmailField().fill('ap@beta.test');
    await billing.billingEmailField().press('Enter');

    await expectToast(page, 'Billing e-mail saved');
    expect(customerWrites).toHaveLength(1);
    expect(customerWrites[0].body).toMatchObject({
      billingEmail: 'ap@beta.test',
      name: 'Beta Industries',
    });
    // Enter in the field sets the address and nothing else.
    expect(subscriptionWrites).toHaveLength(0);
    await expect(billing.dialog()).toBeVisible();
  });

  test('tells an address that is not one, in the words of the customer form, and sends nothing', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const customerWrites = recordWrites(page, /\/api\/customers\/[^/]+$/, [
      'PUT',
    ]);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await billing.billingEmailField().fill('not an address');
    await billing
      .billingEmailNotice()
      .getByRole('button', { name: 'Save e-mail' })
      .click();

    await expect(billing.billingEmailNotice()).toContainText(
      'Enter a valid e-mail address, such as billing@acme.com',
    );
    expect(customerWrites).toHaveLength(0);
  });

  test('is not asked for when the customer has one', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('acme-legacy');

    await billing.openSubscribe();

    await expect(billing.billingEmailNotice()).toHaveCount(0);
  });

  test('can be left for later, and only said to a session that may not write customers', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await signInWithScopes(page, [
      'read:billing',
      'write:billing',
      'read:instances',
      'read:licenses',
    ]);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await expect(billing.billingEmailNotice()).toContainText(
      'Beta Industries has no billing e-mail',
    );
    await expect(billing.billingEmailField()).toHaveCount(0);
    await billing.confirmButton().click();

    await expect(billing.started()).toBeVisible();
  });
});

test.describe('a refusal of the billing e-mail, in the dialog that subscribes', () => {
  // Its own describe: the customers answer from the model armed here, and the
  // first model installed for a page is the one that answers.
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('shows a refusal of the API under the field, in its own words, and takes the focus the disabled field dropped', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const customers = createBillingCustomersModel();
    customers.armProblem('update', {
      code: 'UpdateCustomer.InvalidBillingEmail',
      detail: 'billingEmail must be an address the accounting system accepts',
      status: 422,
    });
    await installCustomerAppMocks(page, customers);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await billing.billingEmailField().fill('ap@beta.test');
    await billing.billingEmailField().press('Enter');

    const refusal = billing.billingEmailNotice().getByRole('alert');
    await expect(refusal).toContainText(
      'billingEmail must be an address the accounting system accepts',
    );
    // The field and the button were disabled while the API answered, and the
    // keyboard would have landed on nothing: the refusal takes the focus.
    await expect(refusal).toBeFocused();
    await expect(billing.billingEmailField()).toHaveValue('ap@beta.test');
    await expect(billing.started()).toHaveCount(0);

    // Nothing was set, so it can be sent again, and goes through.
    await billing.billingEmailField().press('Enter');

    await expectToast(page, 'Billing e-mail saved');
  });
});
