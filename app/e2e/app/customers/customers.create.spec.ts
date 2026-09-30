import { expect, expectToast, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomerFormDriver } from '../_support/drivers/customer-form.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createEmptyCustomersModel } from './customers.scenarios';

test('creates a customer from the list dialog', async ({ page }) => {
  const model = createEmptyCustomersModel();
  const list = new CustomersListDriver(page);
  const form = new CustomerFormDriver(page);

  await installCustomerAppMocks(page, model);
  await list.goto();
  await list.openCreateDialog();

  await expect(page).toHaveURL('/customers/new');
  await expect(
    page.getByRole('heading', { name: 'New Customer' }),
  ).toBeVisible();
  await expect(form.createButton()).toBeDisabled();

  await form.fill({
    domain: 'orbit.dev',
    externalCustomerId: 'crm-orbit-001',
    name: 'Orbit Labs',
  });
  await form.createButton().click();

  await expectToast(page, 'Customer created successfully');
  // Creating lands on the new customer, not back on the list.
  await expect(page).toHaveURL('/customers/orbit-labs');
  await new CustomerDetailDriver(page).expectLoaded('Orbit Labs');
  await list.goto();
  await list.expectCustomerVisible('Orbit Labs');
  await expect(
    list.customerRow('Orbit Labs').getByText('orbit.dev', { exact: true }),
  ).toBeVisible();
});
