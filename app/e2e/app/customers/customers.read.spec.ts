import { expect, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createCustomersListModel } from './customers.scenarios';

test.describe('customers read', () => {
  test('renders the customers list and filters by search text', async ({
    page,
  }) => {
    const model = createCustomersListModel();
    const list = new CustomersListDriver(page);

    await installCustomerAppMocks(page, model);
    await list.goto();

    await list.expectCustomerVisible('Acme Corp');
    await list.expectCustomerVisible('Beta Industries');

    await list.search('Beta');

    await list.expectCustomerVisible('Beta Industries');
    await list.expectCustomerHidden('Acme Corp');
  });

  test('opens the customer detail page and lists its instances', async ({
    page,
  }) => {
    const model = createCustomersListModel();
    const list = new CustomersListDriver(page);
    const detail = new CustomerDetailDriver(page);

    await installCustomerAppMocks(page, model);
    await list.goto();
    await list.openCustomer('Acme Corp');

    await expect(page).toHaveURL('/customers/acme-corp');
    await detail.expectLoaded('Acme Corp');
    await expect(page.getByText('Domain', { exact: true })).toBeVisible();
    await expect(page.getByText('acme.com', { exact: true })).toBeVisible();
    await detail.expectInstanceVisible('Acme Production');
    await detail.expectInstanceVisible('Acme Legacy');
  });
});
