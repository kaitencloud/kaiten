import { expect, expectToast, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomerFormDriver } from '../_support/drivers/customer-form.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createEditableCustomerModel } from './customers.scenarios';

test('updates a customer from the detail page edit mode', async ({ page }) => {
  const model = createEditableCustomerModel();
  const detail = new CustomerDetailDriver(page);
  const form = new CustomerFormDriver(page);
  const list = new CustomersListDriver(page);

  await installCustomerAppMocks(page, model);
  await detail.goto('acme-corp');
  await detail.expectLoaded('Acme Corp');

  await detail.startEdit();

  await expect(page).toHaveURL(/\/customers\/acme-corp\?mode=configure$/);
  await expect(form.updateButton()).toBeDisabled();

  await form.fill({
    domain: 'acme.eu',
    externalCustomerId: 'crm-acme-emea-001',
    name: 'Acme Europe',
  });
  await form.updateButton().click();

  await expectToast(page, 'Customer updated successfully');
  await expect(page).toHaveURL('/customers/acme-corp');
  await detail.expectLoaded('Acme Europe');
  await expect(page.getByText('acme.eu', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Customers' }).first().click();
  await list.expectLoaded();
  await list.expectCustomerVisible('Acme Europe');
  await list.expectCustomerHidden('Acme Corp');

  await list.openCustomer('Acme Europe');
  await expect(page).toHaveURL('/customers/acme-corp');
  await detail.expectLoaded('Acme Europe');
});
