import { expect, test } from '../_support/app-test';
import { InstanceDetailDriver } from '../_support/drivers/instance-detail.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createInstancesListModel } from './instances.scenarios';

test.describe('instances read', () => {
  test('renders the instances list and filters by search text', async ({
    page,
  }) => {
    const model = createInstancesListModel();
    const list = new InstancesListDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();

    await list.expectInstanceVisible('Acme Production');
    await list.expectInstanceVisible('Beta Staging');
    await list.expectInstanceVisible('Acme Legacy');

    await list.search('Beta');

    await list.expectInstanceVisible('Beta Staging');
    await list.expectInstanceHidden('Acme Production');
  });

  test('opens the instance detail page from the list', async ({ page }) => {
    const model = createInstancesListModel();
    const list = new InstancesListDriver(page);
    const detail = new InstanceDetailDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.openInstance('Acme Production');

    await expect(page).toHaveURL('/customers/instances/acme-production');
    await detail.expectLoaded('Acme Production');
    await detail.expectCustomerVisible('Acme Corp');
    await detail.expectLicenseVisible('Enterprise');
    await detail.expectTabVisible('Entitlements & Usage');
  });
});
