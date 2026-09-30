import { expect, expectErrorToast, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomerFormDriver } from '../_support/drivers/customer-form.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import {
  createDeletableCustomerModel,
  createEditableCustomerModel,
  createEmptyCustomersModel,
} from './customers.scenarios';

test.describe('customers errors', () => {
  test('shows an error toast when customer creation fails with a server error', async ({
    page,
  }) => {
    const model = createEmptyCustomersModel();
    const list = new CustomersListDriver(page);
    const form = new CustomerFormDriver(page);

    // Arm the model to fail the next create call with a 500
    model.setNextCreateError(500);

    await installCustomerAppMocks(page, model);
    await list.goto();
    await list.openCreateDialog();

    await form.fill({ name: 'Orbit Labs' });
    await form.createButton().click();

    // The app must show an error toast — customer must not appear in the list
    await expectErrorToast(page);
    await expect(page).toHaveURL('/customers/new');
    await list.goto();
    await list.expectCustomerHidden('Orbit Labs');
  });

  test('shows an error toast when customer update fails with a server error', async ({
    page,
  }) => {
    const model = createEditableCustomerModel();
    const detail = new CustomerDetailDriver(page);
    const form = new CustomerFormDriver(page);

    // Arm the model to fail the next update call with a 500
    model.setNextUpdateError(500);

    await installCustomerAppMocks(page, model);
    await detail.goto('acme-corp');
    await detail.expectLoaded('Acme Corp');
    await detail.startEdit();

    await form.fill({ name: 'Acme Corp Renamed' });
    await form.updateButton().click();

    // The app must show an error toast — the customer name must be unchanged
    await expectErrorToast(page);
    await expect(page).toHaveURL(/\/customers\/acme-corp/);
  });

  test('shows an error toast when customer delete fails with a server error', async ({
    page,
  }) => {
    const model = createDeletableCustomerModel();
    const list = new CustomersListDriver(page);

    // Arm the next delete call to fail with a 500
    model.setNextError('delete', 500);

    await installCustomerAppMocks(page, model);
    await list.goto();
    await list.expectCustomerVisible('Gamma Labs');

    await list.openDeleteDialog('Gamma Labs');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Toast must be an error and the row must still be there.
    await expectErrorToast(page);
    await list.goto();
    await list.expectCustomerVisible('Gamma Labs');
  });
});
