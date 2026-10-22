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

test('puts the focus on the title of the customer it just created', async ({
  page,
}) => {
  const list = new CustomersListDriver(page);
  const form = new CustomerFormDriver(page);

  await installCustomerAppMocks(page, createEmptyCustomersModel());
  await list.goto();
  await list.openCreateDialog();
  await form.fill({ name: 'Orbit Labs' });
  await form.createButton().click();

  // The link that opened the dialog is not on this page: the focus does not fall to the page.
  await expect(page).toHaveURL('/customers/orbit-labs');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('gives the focus back to the New Customer link when the dialog is dismissed', async ({
  page,
}) => {
  const list = new CustomersListDriver(page);

  await installCustomerAppMocks(page, createEmptyCustomersModel());
  await list.goto();
  await list.createLink().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page).toHaveURL('/customers');
  await expect(list.createLink()).toBeFocused();
});
