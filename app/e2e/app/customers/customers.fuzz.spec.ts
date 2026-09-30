import { expect, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createFuzzCustomersReadModel } from './customers.scenarios';

const FUZZ_CUSTOMERS_READ_SEEDS = [2026042501, 2026042502, 2026042503];

test.describe('customers read fuzz', () => {
  for (const seed of FUZZ_CUSTOMERS_READ_SEEDS) {
    test(`filters and opens generated customers for seed ${seed}`, async ({
      page,
    }) => {
      const scenario = createFuzzCustomersReadModel(seed);
      const list = new CustomersListDriver(page);
      const detail = new CustomerDetailDriver(page);

      await installCustomerAppMocks(page, scenario.model);
      await list.goto();

      await list.expectCustomerVisible(scenario.matchingCustomer.name);

      await list.search(scenario.searchTerm);
      await list.expectCustomerVisible(scenario.matchingCustomer.name);
      await list.expectCustomerHidden(scenario.hiddenCustomer.name);

      await list.openCustomer(scenario.matchingCustomer.name);

      await expect(page).toHaveURL(
        `/customers/${scenario.matchingCustomer.slug}`,
      );
      await detail.expectLoaded(scenario.matchingCustomer.name);
      await detail.expectInstanceVisible(scenario.instanceName);
    });
  }
});
