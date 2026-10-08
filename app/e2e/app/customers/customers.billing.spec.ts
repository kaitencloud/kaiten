import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomerFormDriver } from '../_support/drivers/customer-form.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { signInWithScopes } from '../_support/session-scopes';
import {
  createBillingDisabledModel,
  createBillingOutageModel,
  createManyAcmeInvoicesModel,
  createSubscriptionsModel,
} from '../billing/billing.scenarios';
import { createBillingCustomersModel } from './customers.scenarios';

// What a customer carries of billing: the address its invoices are addressed to,
// which the form takes and the page shows, and the invoices of all its instances.
// Both are absent where billing is off or the session may not read it.

const CUSTOMER_WRITES = /\/api\/customers/;

test.describe('the billing e-mail of a customer', () => {
  // Each test installs the customers, so that one can arm them first.
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createSubscriptionsModel());
  });

  test('is shown on the page of the customer, and says when there is none', async ({
    page,
  }) => {
    await installCustomerAppMocks(page, createBillingCustomersModel());
    const detail = new CustomerDetailDriver(page);

    await detail.goto('acme-corp');
    await detail.expectLoaded('Acme Corp');

    await expect(detail.detailsRow('Billing e-mail')).toContainText(
      'ap@acme.com',
    );

    await detail.goto('beta-industries');
    await detail.expectLoaded('Beta Industries');

    await expect(detail.detailsRow('Billing e-mail')).toContainText('Not set');
  });

  test('is asked for when a customer is created, and sent as it was typed once trimmed', async ({
    page,
  }) => {
    await installCustomerAppMocks(page, createBillingCustomersModel());
    const form = new CustomerFormDriver(page);
    const writes = recordWrites(page, CUSTOMER_WRITES, ['POST']);

    await page.goto('/customers/new');
    await form.fill({
      billingEmail: '  billing@orbit.dev ',
      name: 'Orbit Labs',
    });
    await form.createButton().click();

    await expectToast(page, 'Customer created successfully');
    await expect(page).toHaveURL('/customers/orbit-labs');
    expect(writes[0].body).toMatchObject({
      billingEmail: 'billing@orbit.dev',
      name: 'Orbit Labs',
    });
    await expect(
      new CustomerDetailDriver(page).detailsRow('Billing e-mail'),
    ).toContainText('billing@orbit.dev');
  });

  test('is left out of the request when a customer is created without one', async ({
    page,
  }) => {
    await installCustomerAppMocks(page, createBillingCustomersModel());
    const form = new CustomerFormDriver(page);
    const writes = recordWrites(page, CUSTOMER_WRITES, ['POST']);

    await page.goto('/customers/new');
    await form.fill({ name: 'Orbit Labs' });
    await form.createButton().click();

    await expectToast(page, 'Customer created successfully');
    expect(writes[0].body).not.toHaveProperty('billingEmail');
  });

  test('is changed from the form of the customer, which sends the one it was opened with when it is not touched', async ({
    page,
  }) => {
    await installCustomerAppMocks(page, createBillingCustomersModel());
    const detail = new CustomerDetailDriver(page);
    const form = new CustomerFormDriver(page);
    const writes = recordWrites(page, CUSTOMER_WRITES, ['PUT']);

    await detail.goto('acme-corp');
    await detail.startEdit();
    await expect(form.billingEmailField()).toHaveValue('ap@acme.com');
    await form.fill({ name: 'Acme Europe' });
    await form.updateButton().click();

    await expectToast(page, 'Customer updated successfully');
    expect(writes[0].body).toMatchObject({
      billingEmail: 'ap@acme.com',
      name: 'Acme Europe',
    });

    await detail.startEdit();
    await form.fill({ billingEmail: 'accounts@acme.com' });
    await form.updateButton().click();

    await expectToast(page, 'Customer updated successfully');
    expect(writes[1].body).toMatchObject({ billingEmail: 'accounts@acme.com' });
    await expect(detail.detailsRow('Billing e-mail')).toContainText(
      'accounts@acme.com',
    );
  });

  test('is removed by emptying the field, which sends an empty string and not nothing', async ({
    page,
  }) => {
    await installCustomerAppMocks(page, createBillingCustomersModel());
    const detail = new CustomerDetailDriver(page);
    const form = new CustomerFormDriver(page);
    const writes = recordWrites(page, CUSTOMER_WRITES, ['PUT']);

    await detail.goto('acme-corp');
    await detail.startEdit();
    await form.billingEmailField().clear();
    await form.updateButton().click();

    await expectToast(page, 'Customer updated successfully');
    expect(writes[0].body).toMatchObject({ billingEmail: '' });
    await expect(detail.detailsRow('Billing e-mail')).toContainText('Not set');
  });

  test('is checked as the API will check it, before anything is sent', async ({
    page,
  }) => {
    await installCustomerAppMocks(page, createBillingCustomersModel());
    const form = new CustomerFormDriver(page);
    const writes = recordWrites(page, CUSTOMER_WRITES, ['POST']);

    await page.goto('/customers/new');
    await form.fill({ billingEmail: 'not an address', name: 'Orbit Labs' });
    await form.billingEmailField().blur();

    await expect(
      page.getByText('Enter a valid e-mail address, such as billing@acme.com'),
    ).toBeVisible();
    await expect(form.createButton()).toBeDisabled();

    await form.billingEmailField().fill(`${'a'.repeat(250)}@b.co`);
    await form.billingEmailField().blur();

    await expect(
      page.getByText('The e-mail address is too long (254 characters at most)'),
    ).toBeVisible();
    expect(writes).toHaveLength(0);
  });

  test('is refused by the API on its own field, in the words of the API', async ({
    page,
  }) => {
    const form = new CustomerFormDriver(page);
    const model = createBillingCustomersModel();
    model.armProblem('update', {
      code: 'UpdateCustomer.InvalidBillingEmail',
      detail:
        'billingEmail must be an e-mail address of at most 254 characters',
      status: 422,
    });
    await installCustomerAppMocks(page, model);

    await page.goto('/customers/acme-corp?mode=configure');
    await form.fill({ billingEmail: 'accounts@acme.com' });
    await form.updateButton().click();

    await expect(
      page.getByText(
        'billingEmail must be an e-mail address of at most 254 characters',
      ),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('the invoices of a customer', () => {
  test('are listed across its instances, newest first, with the way to each', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await detail.goto('acme-corp');

    await expect(detail.invoiceRows()).toHaveCount(4);
    // The first column says whose each invoice is: its customer and its instance.
    await expect(detail.invoicesCard()).toContainText('acme-production');
    await expect(detail.invoicesCard()).toContainText('acme-legacy');
    await detail
      .invoicesCard()
      .getByRole('row')
      .filter({ hasText: 'acme-production' })
      .filter({ hasText: 'Renewal' })
      .getByRole('link')
      .first()
      .click();

    await expect(page).toHaveURL(/\/billing\/invoices\/inv-acme-renewal$/);
  });

  test('are read fifty at a time, and the rest on request', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createManyAcmeInvoicesModel());
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await detail.goto('acme-corp');

    await expect(detail.invoiceRows()).toHaveCount(50);
    await detail.loadMoreInvoices().click();

    await expect(detail.invoiceRows()).toHaveCount(60);
    await expect(detail.loadMoreInvoices()).toHaveCount(0);
    expect(new URLSearchParams(reads[0].search).get('customerSlug')).toBe(
      'acme-corp',
    );
    expect(reads).toHaveLength(2);
  });

  test('say there is none yet, for a customer none of whose instances was invoiced', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await detail.goto('beta-industries');

    await expect(detail.invoicesEmpty()).toContainText('No invoices yet');
    await expect(detail.invoicesEmpty()).toContainText(
      'None of the instances of this customer has been invoiced yet.',
    );
  });

  test('show a refusal in their card, with a way to ask again, and leave the page of the customer as it is', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);
    const billing = createSubscriptionsModel();
    billing.invoices.armProblem('listInvoices', {
      code: 'Billing.EntitlementCheckUnavailable',
      detail: 'The billing entitlement could not be checked',
      status: 503,
    });
    await installBillingAppMocks(page, billing);
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await detail.goto('acme-corp');

    await expect(detail.invoicesError()).toContainText(
      'The billing entitlement could not be checked',
    );
    await expect(detail.detailsRow('Billing e-mail')).toContainText(
      'ap@acme.com',
    );
    await detail.invoicesError().getByRole('button', { name: 'Retry' }).click();

    await expect(detail.invoiceRows()).toHaveCount(4);
  });
});

test.describe('the page of a customer where billing is not there', () => {
  test('has neither the billing e-mail nor the invoices where billing is off', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);
    const form = new CustomerFormDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await detail.goto('acme-corp');
    await detail.expectLoaded('Acme Corp');

    await expect(detail.detailsRow('Billing e-mail')).toHaveCount(0);
    await expect(detail.invoicesCard()).toHaveCount(0);

    await detail.startEdit();
    await expect(form.nameField()).toBeVisible();
    await expect(form.billingEmailField()).toHaveCount(0);
  });

  test('has neither for a session that may not read billing, whose token the capabilities refuse', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);
    await signInWithScopes(page, ['read:customers', 'read:instances']);
    await installBillingAppMocks(
      page,
      createBillingOutageModel('missingScope'),
    );
    await installCustomerAppMocks(page, createBillingCustomersModel());

    await detail.goto('acme-corp');
    await detail.expectLoaded('Acme Corp');

    await expect(detail.detailsRow('Billing e-mail')).toHaveCount(0);
    await expect(detail.invoicesCard()).toHaveCount(0);
  });
});
