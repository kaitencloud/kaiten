import { expect, test } from '../_support/app-test';
import { LicenseVersionFormDriver } from '../_support/drivers/license-version-form.driver';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createLicenseCatalogModel,
  createNumberedLicenseFamilyModel,
} from './licenses.scenarios';

test('adds a draft version to a license family', async ({ page }) => {
  const list = new LicensesListDriver(page);
  const form = new LicenseVersionFormDriver(page);

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await list.goto();
  await list.startNewVersion('Starter');

  // A new version starts from the family's default.
  await expect(page).toHaveURL('/licenses/versions/starter-v2');
  await form.expectLoaded('Starter');
  await form.fillVersionName('Summer');
  await form.saveAsDraft();
  await form.submit();

  await expect(page).toHaveURL('/licenses');
  await list.expandFamily('Starter');
  await list.expectVersionState('Starter', 'Summer', 'Draft');
  await expect(
    list.lifecycleAction('Starter', 'Summer', 'Publish'),
  ).toBeEnabled();
});

test('adds a published version unless asked for a draft', async ({ page }) => {
  const list = new LicensesListDriver(page);
  const form = new LicenseVersionFormDriver(page);

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await list.goto();
  await list.startNewVersion('Starter');
  await form.expectLoaded('Starter');
  await form.fillVersionName('Autumn');
  await form.submit();

  await expect(page).toHaveURL('/licenses');
  await list.expandFamily('Starter');
  await list.expectVersionState('Starter', 'Autumn', 'Published');
});

// Opened from a family, the form comes filled in: the family, its head version
// as the base, and a suggested name. Accepting them all is enough to create
// the version.
test('adds a version from the suggested values without editing any', async ({
  page,
}) => {
  const list = new LicensesListDriver(page);
  const form = new LicenseVersionFormDriver(page);

  await installLicenseAppMocks(page, createNumberedLicenseFamilyModel());
  await list.goto();
  await list.startNewVersion('Starter');
  await form.expectLoaded('Starter');
  expect(await form.versionName()).toBe('Starter v3');
  await form.submit();

  await expect(page).toHaveURL('/licenses');
  await list.expandFamily('Starter');
  await list.expectVersionState('Starter', 'Starter v3', 'Published');
});
