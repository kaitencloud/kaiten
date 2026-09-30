import { expect, expectToast, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import {
  createCustomersListModel,
  createDeletableCustomerModel,
} from './customers.scenarios';

test.describe('customers delete', () => {
  test('deletes a customer from the list when no active instance is linked', async ({
    page,
  }) => {
    const model = createDeletableCustomerModel();
    const list = new CustomersListDriver(page);

    await installCustomerAppMocks(page, model);
    await list.goto();
    await list.expectCustomerVisible('Gamma Labs');

    await list.openDeleteDialog('Gamma Labs');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expectToast(page, 'Customer deleted successfully');
    await list.expectCustomerHidden('Gamma Labs');
  });

  test('deletes a customer from the detail page and returns to the list', async ({
    page,
  }) => {
    const model = createDeletableCustomerModel();
    const detail = new CustomerDetailDriver(page);
    const list = new CustomersListDriver(page);

    await installCustomerAppMocks(page, model);
    await detail.goto('gamma-labs');
    await detail.expectLoaded('Gamma Labs');

    await detail.deleteButton().click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expectToast(page, 'Customer deleted successfully');
    await expect(page).toHaveURL('/customers');
    await list.expectLoaded();
    await list.expectCustomerHidden('Gamma Labs');
  });

  test('keeps delete disabled when the customer still has active instances', async ({
    page,
  }) => {
    const model = createCustomersListModel();
    const list = new CustomersListDriver(page);
    const detail = new CustomerDetailDriver(page);

    await installCustomerAppMocks(page, model);
    await list.goto();

    await expect(list.deleteAction('Acme Corp')).toBeDisabled();

    await detail.goto('acme-corp');
    await detail.expectLoaded('Acme Corp');
    await expect(detail.deleteButton()).toBeDisabled();
  });
});
