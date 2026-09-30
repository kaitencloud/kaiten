import {
  expect,
  expectDialogClosed,
  expectToast,
  test,
} from '../_support/app-test';
import { DeploymentZoneDetailDriver } from '../_support/drivers/deployment-zone-detail.driver';
import { DeploymentZoneDialogDriver } from '../_support/drivers/deployment-zone-dialog.driver';
import { installReleaseManagementAppMocks } from '../_support/mocks/install-release-management-app-mocks';
import { createDeploymentZoneEditModel } from './release-management.scenarios';

test('updates a deployment zone from the route-driven edit dialog', async ({
  page,
}) => {
  const model = createDeploymentZoneEditModel();
  const dialog = new DeploymentZoneDialogDriver(page);
  const detail = new DeploymentZoneDetailDriver(page);

  await installReleaseManagementAppMocks(page, model);
  await page.goto('/releases/deployment-zones/production-eu/edit');

  await expect(
    page.getByRole('heading', { name: 'Edit Deployment Zone' }),
  ).toBeVisible();

  await dialog.fillDetails({
    description: 'European production cluster with canary traffic enabled',
    name: 'Production EU West',
  });
  await expect(dialog.updateButton()).toBeEnabled();
  await dialog.updateButton().click();

  await expectToast(page, 'Deployment zone updated successfully');
  await expect(page).toHaveURL('/releases/deployment-zones');
  await expectDialogClosed(page);
  await page.goto('/releases/deployment-zones');
  // The edit dialog never sends `releaseId`, and the API reads an omitted one
  // as "keep the current release": the zone still runs v1.4.0.
  await expect(
    page.locator('tbody tr').filter({ hasText: 'Production EU West' }).first(),
  ).toContainText('v1.4.0');
  // The old singular URL still lands on the zone.
  await page.goto('/releases/deployment-zone/production-eu');
  await expect(page).toHaveURL('/releases/deployment-zones/production-eu');
  await detail.expectLoaded('Production EU West');
  await detail.expectDescriptionVisible(
    'European production cluster with canary traffic enabled',
  );
  await detail.expectCurrentReleaseVisible('v1.4.0');
});
