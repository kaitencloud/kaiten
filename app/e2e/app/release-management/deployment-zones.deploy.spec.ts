import {
  expect,
  expectDialogClosed,
  expectToast,
  test,
} from '../_support/app-test';
import {
  expectTrackedEvent,
  installTrackingCapture,
} from '../_support/assertions/tracking';
import { DeploymentZoneDetailDriver } from '../_support/drivers/deployment-zone-detail.driver';
import { DeploymentZoneDialogDriver } from '../_support/drivers/deployment-zone-dialog.driver';
import { installReleaseManagementAppMocks } from '../_support/mocks/install-release-management-app-mocks';
import { createDeploymentFlowModel } from './release-management.scenarios';

test('deploys another release to a deployment zone and reflects the change across surfaces', async ({
  page,
}) => {
  const model = createDeploymentFlowModel();
  const dialog = new DeploymentZoneDialogDriver(page);
  const detail = new DeploymentZoneDetailDriver(page);

  await installTrackingCapture(page);
  await installReleaseManagementAppMocks(page, model);
  await page.goto('/releases/deployment-zones/production-eu/deploy');

  await expect(
    page.getByRole('heading', { name: 'Deploy a release to Production EU' }),
  ).toBeVisible();
  await expect(dialog.releaseField()).toHaveText(/v1\.4\.0/);

  await dialog.chooseRelease(/v1\.5\.0-rc1/);
  await expect(dialog.releaseField()).toHaveText(/v1\.5\.0-rc1/);
  await dialog.deployButton().click();

  await expectToast(page, 'Release deployed successfully');
  await expectTrackedEvent(page, 'release_deployed', {
    deploymentZoneName: 'Production EU',
    deploymentZoneSlug: 'production-eu',
    releaseId: 'release-1-5-0-rc1',
  });
  await expect(page).toHaveURL('/releases/deployment-zones');
  await expectDialogClosed(page);
  await page.goto('/releases/deployment-zones');
  await expect(
    page.locator('tbody tr').filter({ hasText: 'Production EU' }).first(),
  ).toContainText('v1.5.0-rc1');

  // Click the name cell (leftmost, always visible) rather than the bare row:
  // the row centre overlaps the interactive "releases" cell once the table
  // can scroll horizontally, which would open the history dialog instead of
  // navigating.
  await page
    .locator('tbody tr')
    .filter({ hasText: 'Production EU' })
    .first()
    .getByRole('cell')
    .first()
    .click();

  await expect(page).toHaveURL('/releases/deployment-zones/production-eu');
  await detail.expectLoaded('Production EU');
  await detail.expectCurrentReleaseVisible('v1.5.0-rc1');
});

test('offers only releases to a zone that already runs one, since the API cannot undeploy', async ({
  page,
}) => {
  const model = createDeploymentFlowModel();
  const dialog = new DeploymentZoneDialogDriver(page);

  await installReleaseManagementAppMocks(page, model);
  await page.goto('/releases/deployment-zones/production-eu/deploy');

  await expect(dialog.releaseField()).toHaveText(/v1\.4\.0/);
  // Deploy waits for a release other than the one the zone runs.
  await expect(dialog.deployButton()).toBeDisabled();

  await dialog.releaseField().click();
  // An omitted `releaseId` means "keep the current release" to the API, so a
  // "None (undeploy)" entry would close the dialog on a success toast and
  // change nothing. The list holds the two releases and no such entry.
  await expect(dialog.releaseOptions()).toHaveText([
    /v1\.5\.0-rc1/,
    /v1\.4\.0/,
  ]);
  await expect(page.getByText(/undeploy/i)).toHaveCount(0);
});
