import { expect, expectToast, test } from '../_support/app-test';
import { InstanceDetailDriver } from '../_support/drivers/instance-detail.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createDeletableInstanceModel } from './instances.scenarios';

test.describe('instances delete', () => {
  test('deletes an instance from the list', async ({ page }) => {
    const model = createDeletableInstanceModel();
    const list = new InstancesListDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.expectInstanceVisible('Gamma Sandbox');

    await list.openDeleteDialog('Gamma Sandbox');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // The mocks only record the deletion once they answer the DELETE; reloading
    // before the success toast would bring the seeded instance back.
    await expectToast(page, 'Instance deleted successfully');
    await list.goto();
    await list.expectInstanceHidden('Gamma Sandbox');
  });

  test('deletes an instance from the detail page', async ({ page }) => {
    const model = createDeletableInstanceModel();
    const detail = new InstanceDetailDriver(page);
    const list = new InstancesListDriver(page);

    await installInstanceAppMocks(page, model);
    await detail.goto('gamma-sandbox');
    await detail.expectLoaded('Gamma Sandbox');

    await detail.deleteButton().click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page).toHaveURL('/customers/instances');
    await list.expectLoaded();
    await list.expectInstanceHidden('Gamma Sandbox');
  });
});
