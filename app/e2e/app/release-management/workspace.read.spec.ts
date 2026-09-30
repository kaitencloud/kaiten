import { expect, test } from '../_support/app-test';
import { DeploymentZoneDetailDriver } from '../_support/drivers/deployment-zone-detail.driver';
import { ReleaseDetailDriver } from '../_support/drivers/release-detail.driver';
import { ReleaseManagementTabsDriver } from '../_support/drivers/release-management-tabs.driver';
import { installReleaseManagementAppMocks } from '../_support/mocks/install-release-management-app-mocks';
import { createReleaseManagementReadModel } from './release-management.scenarios';

test('navigates the release-management workspace and opens both release and zone details', async ({
  page,
}) => {
  const model = createReleaseManagementReadModel();
  const tabs = new ReleaseManagementTabsDriver(page);
  const releaseDetail = new ReleaseDetailDriver(page);
  const zoneDetail = new DeploymentZoneDetailDriver(page);

  await installReleaseManagementAppMocks(page, model);

  await page.goto('/releases');
  await tabs.expectVisible();
  await expect(
    page.getByRole('heading', { name: 'Releases', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText('v1.5.0-rc1', { exact: true }).first(),
  ).toBeVisible();

  await page.goto('/releases/deployments');
  await expect(
    page.getByRole('heading', { name: 'Deployments', level: 1 }),
  ).toBeVisible();
  await expect(
    page.locator('tbody tr').filter({ hasText: 'v1.4.0' }).first(),
  ).toBeVisible();

  await tabs.openComponents();
  await expect(page).toHaveURL('/releases/components');
  await expect(
    page.getByRole('heading', { name: 'Components', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText('API Gateway', { exact: true }).first(),
  ).toBeVisible();

  await tabs.openDeploymentZones();
  await expect(page).toHaveURL('/releases/deployment-zones');
  await expect(
    page.getByRole('heading', { name: 'Deployment Zones', level: 1 }),
  ).toBeVisible();
  await expect(
    page.locator('tbody tr').filter({ hasText: 'Production EU' }).first(),
  ).toBeVisible();

  await page.goto('/releases/deployments');
  await page.locator('tbody tr').filter({ hasText: 'v1.4.0' }).first().click();

  await expect(page).toHaveURL('/releases/release-1-4-0');
  await releaseDetail.expectLoaded('v1.4.0');
  await releaseDetail.openDeploymentZonesTab();
  await releaseDetail.expectLinkedZoneVisible('Production EU');

  await page.goto('/releases/deployment-zones');
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
  await zoneDetail.expectLoaded('Production EU');
  await zoneDetail.expectCurrentReleaseVisible('v1.4.0');
  await zoneDetail.openPeersTab();
  await zoneDetail.expectPeerZoneVisible('Production US');
});
