import { expect, expectToast, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { FormRecoveryDriver } from '../_support/drivers/form-recovery.driver';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createDraftPricesModel } from './licenses.scenarios';

// The unsent input of the license creation, as the console keeps it in the browser:
// its fields and the entitlements it grants, offered back after a reload and
// forgotten once sent.

test('offers back a half-filled license after a reload, with its grants, and forgets it once sent', async ({
  page,
}) => {
  const recovery = new FormRecoveryDriver(page);
  // The grants card of the new license is the one of a version's page.
  const grants = new LicenseDetailDriver(page);
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  const versionName = page.getByRole('textbox', { name: 'Version Name' });
  await installLicenseAppMocks(page, createDraftPricesModel());

  await page.goto('/catalog/licenses/new');
  await expect(name).toBeVisible();
  await expect(recovery.offer()).toHaveCount(0);
  await name.fill('Bronze');
  await versionName.fill('2027');
  await grants.addNumericGrant('Requests', '500');
  await expect(grants.grantRow('Requests')).toBeVisible();
  await expect.poll(() => readConsoleStorage(page)).toContain('Requests');

  await page.reload();
  await expect(recovery.offer()).toBeVisible();
  await expect(name).toHaveValue('');
  await expect(grants.grantRow('Requests')).toHaveCount(0);

  await recovery.resumeButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  await expect(name).toHaveValue('Bronze');
  await expect(versionName).toHaveValue('2027');
  await expect(grants.grantRow('Requests')).toBeVisible();

  await page.getByRole('button', { name: 'Create License' }).click();
  await expectToast(page, 'License created successfully');
  await expect(page).toHaveURL('/catalog/licenses');

  // Sent: the next visit to the form starts blank, reload or not.
  await page.goto('/catalog/licenses/new');
  await expect(name).toBeVisible();
  await page.reload();
  await expect(name).toHaveValue('');
  await expect(recovery.offer()).toHaveCount(0);
});

test('starts over on a blank form, and Cancel discards the input', async ({
  page,
}) => {
  const recovery = new FormRecoveryDriver(page);
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  await installLicenseAppMocks(page, createDraftPricesModel());

  await page.goto('/catalog/licenses/new');
  await name.fill('Bronze');
  await expect.poll(() => readConsoleStorage(page)).toContain('Bronze');
  await page.reload();
  await recovery.startOverButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  await expect(name).toHaveValue('');

  await name.fill('Silver');
  await expect.poll(() => readConsoleStorage(page)).toContain('Silver');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL('/catalog/licenses');
  await page.goto('/catalog/licenses/new');
  await expect(name).toBeVisible();
  await expect(recovery.offer()).toHaveCount(0);
});
