import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  INITECH_LATE_INVOICE_ID,
} from '../billing/lifecycle-world';

// The payment terms of a contract are a route of its own over the Billing tab: the
// days between issuing an invoice and its due date, for this contract, or the terms
// of the organization when the field is empty. A change takes effect on the next
// invoice: the invoices already issued keep their own due date. Only the days go to
// the API: the collection method and the provider are not this screen's.

const TERMS = /\/api\/instances\/[^/]+\/billing$/;

test.describe('changing the payment terms of a contract', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('says what the terms are and where they come from, and what the organization default comes to', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');

    await lifecycle.openTerms('Initech Production');

    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing\/terms$/,
    );
    await expect(lifecycle.currentTerms()).toContainText(
      'Invoices are payable within 30 days (the default of your organization).',
    );
    await expect(lifecycle.daysField()).toHaveAttribute(
      'placeholder',
      'Organization default: 30',
    );
    await expect(lifecycle.dialog()).toContainText(
      'The change takes effect on the next invoice. Invoices already issued keep their own due date.',
    );
    // Nothing to save until something changes.
    await expect(lifecycle.saveTermsButton()).toBeDisabled();
    await expect(lifecycle.useDefaultTermsButton()).toHaveCount(0);
  });

  test("saves the days typed, and only the days, and the card says they are the contract's", async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');

    await lifecycle.daysField().fill('45');
    await lifecycle.saveTermsButton().click();

    await expectToast(page, 'The payment terms are saved');
    expect(writes).toEqual([
      {
        body: { daysUntilDue: 45 },
        method: 'PATCH',
        pathname: '/api/instances/initech-prod/billing',
      },
    ]);
    await expect(lifecycle.dialog()).toHaveCount(0);
    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing$/,
    );
    const terms = billing.row(billing.subscriptionCard(), 'Payment terms');
    await expect(terms).toContainText('Payable within 45 days');
    await expect(terms).toContainText('This contract');
  });

  test('sends zero as zero: due on receipt is not the default', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');

    await lifecycle.daysField().fill('0');
    await lifecycle.saveTermsButton().click();

    await expectToast(page, 'The payment terms are saved');
    expect(writes[0].body).toEqual({ daysUntilDue: 0 });
    await expect(
      billing.row(billing.subscriptionCard(), 'Payment terms'),
    ).toContainText('This contract');
  });

  test('takes the terms of the organization back with its own button, as null', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');
    await lifecycle.daysField().fill('45');
    await lifecycle.saveTermsButton().click();
    await expectToast(page, 'The payment terms are saved');

    await lifecycle.openTerms('Initech Production');
    await expect(lifecycle.currentTerms()).toContainText(
      '(the terms of this contract)',
    );
    await expect(lifecycle.daysField()).toHaveValue('45');
    await lifecycle.useDefaultTermsButton().click();

    await expectToast(page, 'The terms of your organization apply again');
    expect(writes.map((write) => write.body)).toEqual([
      { daysUntilDue: 45 },
      { daysUntilDue: null },
    ]);
    await expect(
      billing.row(billing.subscriptionCard(), 'Payment terms'),
    ).toContainText('Organization default');
  });

  test('takes them back as well when the field is emptied and saved', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');
    await lifecycle.daysField().fill('45');
    await lifecycle.saveTermsButton().click();
    await expectToast(page, 'The payment terms are saved');
    await lifecycle.openTerms('Initech Production');

    await lifecycle.daysField().fill('');
    await lifecycle.saveTermsButton().click();

    await expectToast(page, 'The terms of your organization apply again');
    expect(writes[1].body).toEqual({ daysUntilDue: null });
  });

  test('refuses more than a year, in words, before the API does', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');

    await lifecycle.daysField().fill('366');
    await lifecycle.daysField().blur();

    await expect(lifecycle.dialog()).toContainText(
      'Enter a whole number of days, from 0 to 365',
    );
    await expect(lifecycle.saveTermsButton()).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('puts the refusal of the days on the field, in the words of the API, keeping what was typed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('updateInstanceBilling', {
      code: 'UpdateInstanceBilling.InvalidDaysUntilDue',
      detail: 'daysUntilDue must be between 0 and 365',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');
    await lifecycle.daysField().fill('45');

    await lifecycle.saveTermsButton().click();

    await expect(lifecycle.dialog()).toContainText(
      'daysUntilDue must be between 0 and 365',
    );
    await expect(lifecycle.alert()).toHaveCount(0);
    await expect(lifecycle.daysField()).toHaveValue('45');
  });

  test('says a period being closed is being closed, and sends the same request again by itself', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, TERMS);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('updateInstanceBilling', {
      code: 'UpdateInstanceBilling.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      retryAfterSeconds: 1,
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');
    await lifecycle.daysField().fill('45');

    await lifecycle.saveTermsButton().click();

    await expect(lifecycle.closing()).toContainText('Closing the period');
    await expectToast(page, 'The payment terms are saved');
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual({ daysUntilDue: 45 });
  });

  test('leaves the invoices already issued with their own due date', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await invoice.goto(INITECH_LATE_INVOICE_ID);
    await expect(invoice.stat('Due')).toContainText('Sep 1, 2026');

    await billing.goto('initech-late');
    await lifecycle.openTerms('Initech Late');
    await lifecycle.daysField().fill('90');
    await lifecycle.saveTermsButton().click();
    await expectToast(page, 'The payment terms are saved');
    await invoice.goto(INITECH_LATE_INVOICE_ID);

    // Issued on 2 Aug on 30 days: the 90 days of the contract are for the next invoice.
    await expect(invoice.stat('Due')).toContainText('Sep 1, 2026');
  });

  test('changes the terms of a trial and of a subscription past due as well', async ({
    page,
  }) => {
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    for (const [slug, name] of [
      ['initech-trial', 'Initech Trial'],
      ['initech-late', 'Initech Late'],
    ] as const) {
      await page.goto(`/customers/instances/${slug}/billing`);
      await lifecycle.openTerms(name);
      await expect(lifecycle.daysField()).toBeVisible();
    }
  });

  test('says a contract that ended has no terms to change', async ({
    page,
  }) => {
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await page.goto('/customers/instances/hooli-prod/billing/terms');

    await expect(page.getByTestId('terms-unavailable')).toContainText(
      'This subscription has ended: it has no terms to change.',
    );
    await expect(lifecycle.saveTermsButton()).toHaveCount(0);
  });
});
