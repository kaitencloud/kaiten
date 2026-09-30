import { expect, expectErrorToast, test } from '../_support/app-test';
import { InstanceFormDriver } from '../_support/drivers/instance-form.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import {
  createDeletableInstanceModel,
  createEditableInstanceModel,
} from './instances.scenarios';

test.describe('instances errors', () => {
  test('shows an error toast when instance update fails with a server error', async ({
    page,
  }) => {
    const model = createEditableInstanceModel();
    const list = new InstancesListDriver(page);
    const form = new InstanceFormDriver(page);

    // Arm the model to fail the next update call with a 500
    model.setNextError('update', 500);

    await installInstanceAppMocks(page, model);
    await page.goto('/customers/instances/acme-production?mode=configure');
    await expect(form.nameField()).toBeVisible();

    await form.fillDetails({
      name: 'Acme Production EU Renamed',
    });
    await form.clickNext();
    await form.clickNext();
    await form.updateButton().click();

    // The app must show an error toast — list still shows the original name.
    await expectErrorToast(page);
    await list.goto();
    await list.expectInstanceVisible('Acme Production');
    await list.expectInstanceHidden('Acme Production EU Renamed');
  });

  test('shows an error toast when instance delete fails with a server error', async ({
    page,
  }) => {
    const model = createDeletableInstanceModel();
    const list = new InstancesListDriver(page);

    // Arm the next delete call to fail with a 500
    model.setNextError('delete', 500);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.expectInstanceVisible('Gamma Sandbox');

    await list.openDeleteDialog('Gamma Sandbox');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Toast must be an error and the row must still be there.
    await expectErrorToast(page);
    await list.goto();
    await list.expectInstanceVisible('Gamma Sandbox');
  });
});
