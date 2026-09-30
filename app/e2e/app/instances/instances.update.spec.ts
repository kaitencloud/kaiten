import { expect, expectToast, test } from '../_support/app-test';
import { InstanceDetailDriver } from '../_support/drivers/instance-detail.driver';
import { InstanceFormDriver } from '../_support/drivers/instance-form.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createEditableInstanceModel } from './instances.scenarios';

test.describe('instances update', () => {
  test('updates the instance details from the edit dialog', async ({
    page,
  }) => {
    const model = createEditableInstanceModel();
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await detail.goto('acme-production');
    await detail.expectLoaded('Acme Production');

    await detail.startEdit();

    await expect(page).toHaveURL(
      /\/customers\/instances\/acme-production\?mode=configure$/,
    );

    // Step 1: instance information.
    await form.fillDetails({
      name: 'Acme Production EU',
      description: 'Primary production environment for the EU region',
    });
    await form.chooseCustomer('Beta Industries');
    await form.clickNext();
    // Step 2: license (already valid) -> Step 3: deployment.
    await form.clickNext();
    await form.updateButton().click();

    await expectToast(page, 'Instance updated successfully');
    await expect(page).toHaveURL('/customers/instances/acme-production');
    await detail.expectLoaded('Acme Production EU');
    await detail.expectCustomerVisible('Beta Industries');

    // Cache invalidation: list view must reflect the new name without a hard
    // reload. Re-opening the detail must show the latest values too.
    const list = new InstancesListDriver(page);
    await list.goto();
    await list.expectInstanceVisible('Acme Production EU');
    await list.expectInstanceHidden('Acme Production');
    await list.openInstance('Acme Production EU');
    await detail.expectLoaded('Acme Production EU');
    await detail.expectCustomerVisible('Beta Industries');
  });

  test('updates the instance license from the edit dialog', async ({
    page,
  }) => {
    const model = createEditableInstanceModel();
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await detail.goto('acme-production');
    await detail.expectLoaded('Acme Production');

    await detail.startEdit();

    await expect(page).toHaveURL(
      /\/customers\/instances\/acme-production\?mode=configure$/,
    );

    // Step 1 (already valid) -> Step 2: license.
    await form.clickNext();
    await form.chooseLicense('Growth v2026.2');
    await form.clickNext();
    await form.updateButton().click();

    await expectToast(page, 'Instance updated successfully');
    await expect(page).toHaveURL('/customers/instances/acme-production');
    await detail.expectLicenseVisible('Growth');
  });
});
