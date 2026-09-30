import { expect, expectToast, test } from '../_support/app-test';
import { DeploymentZoneDialogDriver } from '../_support/drivers/deployment-zone-dialog.driver';
import { ReleaseDetailDriver } from '../_support/drivers/release-detail.driver';
import { ReleaseListDriver } from '../_support/drivers/release-list.driver';
import { ReleasesDialogDriver } from '../_support/drivers/releases-dialog.driver';
import { persistLanguage } from '../_support/language';
import { installReleaseManagementAppMocks } from '../_support/mocks/install-release-management-app-mocks';
import {
  createDeploymentFlowModel,
  createSupersededReleaseModel,
} from './release-management.scenarios';

// A release has one status. Only the overview knows what a zone ran before, so
// a release that shipped and was replaced everywhere reads Superseded on every
// screen that shows its status, not Planned on the ones that go by the zones.
test.describe('release-management release status', () => {
  test('reads a replaced release as Superseded on every screen', async ({
    page,
  }) => {
    const model = createSupersededReleaseModel();
    const list = new ReleaseListDriver(page);
    const releases = new ReleasesDialogDriver(page);

    await installReleaseManagementAppMocks(page, model);

    // /releases: the overview.
    await list.gotoReleases();
    await list.expectStatus('v1.6.0', 'Planned');
    await list.expectStatus('v1.5.0-rc1', 'Staging');
    await list.expectStatus('v1.4.0', 'Deployed');
    await list.expectStatus('v1.3.0', 'Superseded');

    // /releases/deployments: the same releases, the same statuses, the same
    // cards, and a Status filter that has every status.
    await list.gotoDeployments();
    await list.expectStatus('v1.6.0', 'Planned');
    await list.expectStatus('v1.5.0-rc1', 'Staging');
    await list.expectStatus('v1.4.0', 'Deployed');
    await list.expectStatus('v1.3.0', 'Superseded');
    await list.expectStatCount('Total Releases', 4);
    await list.expectStatCount('Deployed', 1);
    await list.expectStatCount('In Staging', 1);
    await list.expectStatCount('Superseded', 1);
    await list.expectStatCount('Planned', 1);
    await list.openStatusFilter();
    await expect(list.statusFilterOptions()).toHaveText([
      'All',
      'Deployed',
      'Staging',
      'Superseded',
      'Planned',
    ]);
    await list.chooseStatusFilterOption('Superseded');
    await list.expectVersions(['v1.3.0']);

    // The releases dialog of the components catalog.
    await page.goto('/releases/components');
    await releases.open('4 releases');
    await releases.expectStatus('v1.3.0', 'Superseded');
    await releases.expectStatus('v1.4.0', 'Deployed');
    await releases.expectStatus('v1.5.0-rc1', 'Staging');
    await releases.expectStatus('v1.6.0', 'Planned');

    // The releases dialog of a deployment zone. It lists every release the
    // zone ever ran, so it is the screen most likely to hold a superseded one.
    await page.goto('/releases/deployment-zones');
    await releases.openFromRow('Production EU', '2 releases');
    await releases.expectStatus('v1.3.0', 'Superseded');
    await releases.expectStatus('v1.4.0', 'Deployed');

    // The release's own page.
    await page.goto('/releases/release-1-3-0');
    const detail = new ReleaseDetailDriver(page);
    await detail.expectLoaded('v1.3.0');
    await detail.expectStatus('Superseded');
  });

  // The labels come from the locale bundle, not from the status word the code
  // holds: a French console never prints Superseded or Deployed.
  test('prints the status of a release in French on every screen that shows one', async ({
    page,
  }) => {
    const model = createSupersededReleaseModel();
    const list = new ReleaseListDriver(page);
    const releases = new ReleasesDialogDriver(page);

    await installReleaseManagementAppMocks(page, model);
    await page.goto('/releases/deployments');
    await persistLanguage(page, 'fr');
    await page.reload();
    await list.expectLoaded();

    await list.expectStatus('v1.6.0', 'Planifiée');
    await list.expectStatus('v1.5.0-rc1', 'En staging');
    await list.expectStatus('v1.4.0', 'Déployée');
    await list.expectStatus('v1.3.0', 'Remplacée');
    await list.expectStatCount('Remplacées', 1);

    await page.goto('/releases/components');
    await releases.open('4 releases');
    await releases.expectStatus('v1.3.0', 'Remplacée');
    await releases.expectStatus('v1.4.0', 'Déployée');
    await releases.expectStatus('v1.5.0-rc1', 'En staging');
    await releases.expectStatus('v1.6.0', 'Planifiée');

    await page.goto('/releases/deployment-zones');
    await releases.openFromRow('Production EU', '2 releases');
    await releases.expectStatus('v1.3.0', 'Remplacée');
    await releases.expectStatus('v1.4.0', 'Déployée');
  });

  // The deployments page reads the overview, which the delete invalidates: the
  // release leaves the rows and the cards once the API has answered.
  test('drops a deleted release from the deployments list and its cards', async ({
    page,
  }) => {
    const model = createSupersededReleaseModel();
    const list = new ReleaseListDriver(page);

    await installReleaseManagementAppMocks(page, model);
    await list.gotoDeployments();
    await list.expectStatus('v1.6.0', 'Planned');
    await list.expectStatCount('Total Releases', 4);
    await list.expectStatCount('Planned', 1);

    await list.deleteRelease('v1.6.0');
    await expectToast(page, 'Release deleted successfully');

    await list.expectVersions(['v1.5.0-rc1', 'v1.4.0', 'v1.3.0']);
    await list.expectStatCount('Total Releases', 3);
    await list.expectStatCount('Planned', 0);
    await list.expectStatCount('Superseded', 1);
  });

  test('reads a release as Superseded once a deployment has replaced it on its last zone', async ({
    page,
  }) => {
    const model = createDeploymentFlowModel();
    const dialog = new DeploymentZoneDialogDriver(page);
    const list = new ReleaseListDriver(page);

    await installReleaseManagementAppMocks(page, model);

    // v1.4.0 runs on both production zones. Replacing it on one leaves it
    // running on the other.
    await page.goto('/releases/deployment-zones/production-eu/deploy');
    await dialog.chooseRelease(/v1\.5\.0-rc1/);
    await dialog.deployButton().click();
    await expectToast(page, 'Release deployed successfully');

    await list.gotoDeployments();
    await list.expectStatus('v1.4.0', 'Deployed');
    await list.expectStatus('v1.5.0-rc1', 'Deployed');

    // Replaced on the last one, v1.4.0 runs nowhere but did run: Superseded,
    // not Planned, on both lists.
    await page.goto('/releases/deployment-zones/production-us/deploy');
    await dialog.chooseRelease(/v1\.5\.0-rc1/);
    await dialog.deployButton().click();
    await expectToast(page, 'Release deployed successfully');

    await list.gotoDeployments();
    await list.expectStatus('v1.4.0', 'Superseded');
    await list.expectStatus('v1.5.0-rc1', 'Deployed');
    await list.gotoReleases();
    await list.expectStatus('v1.4.0', 'Superseded');
    await list.expectStatus('v1.5.0-rc1', 'Deployed');
  });
});
