import { expect, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { FormRecoveryDriver } from '../_support/drivers/form-recovery.driver';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicenseVersionFormDriver } from '../_support/drivers/license-version-form.driver';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createPricedCatalogModel } from './licenses.scenarios';

// The unsent input of a new version, as the console keeps it in the browser: its
// fields and the grants it starts with, offered back after a reload on the page of
// the version it was begun from, and forgotten once sent.

test('offers back a half-filled new version after a reload, with its grants, and forgets it once sent', async ({
  page,
}) => {
  const recovery = new FormRecoveryDriver(page);
  const form = new LicenseVersionFormDriver(page);
  // The grants card of the new version is the one of a version's page.
  const grants = new LicenseDetailDriver(page);
  await installLicenseAppMocks(page, createPricedCatalogModel());

  await page.goto('/catalog/licenses/versions/pro-v2');
  await form.expectLoaded('Pro');
  await expect(grants.grantRow('Seats')).toBeVisible();
  await expect(recovery.offer()).toHaveCount(0);
  const suggested = await form.versionName();
  await form.fillVersionName('Pro Edge');
  await grants.addNumericGrant('Latency', '250');
  await expect(grants.grantRow('Latency')).toBeVisible();
  await expect.poll(() => readConsoleStorage(page)).toContain('Latency');

  await page.reload();
  await expect(recovery.offer()).toBeVisible();
  expect(await form.versionName()).toBe(suggested);
  await expect(grants.grantRow('Latency')).toHaveCount(0);

  // A page opened from no version is another context: nothing is offered there.
  await page.goto('/catalog/licenses/versions/new');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(recovery.offer()).toHaveCount(0);

  await page.goto('/catalog/licenses/versions/pro-v2');
  await recovery.resumeButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  expect(await form.versionName()).toBe('Pro Edge');
  await expect(grants.grantRow('Latency')).toBeVisible();
  await expect(grants.grantRow('Seats')).toBeVisible();

  await form.submit();
  await expect(page).toHaveURL('/catalog/licenses');

  // Sent: the next visit to the page starts afresh, reload or not.
  await page.goto('/catalog/licenses/versions/pro-v2');
  await form.expectLoaded('Pro');
  await page.reload();
  await form.expectLoaded('Pro');
  await expect(recovery.offer()).toHaveCount(0);
  await expect(grants.grantRow('Latency')).toHaveCount(0);
});

test('starts over from the base, and Cancel discards the input', async ({
  page,
}) => {
  const recovery = new FormRecoveryDriver(page);
  const form = new LicenseVersionFormDriver(page);
  await installLicenseAppMocks(page, createPricedCatalogModel());

  await page.goto('/catalog/licenses/versions/pro-v2');
  await form.expectLoaded('Pro');
  const suggested = await form.versionName();
  await form.fillVersionName('Pro Edge');
  await expect.poll(() => readConsoleStorage(page)).toContain('Pro Edge');
  await page.reload();
  await recovery.startOverButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  expect(await form.versionName()).toBe(suggested);

  await form.fillVersionName('Pro Lab');
  await expect.poll(() => readConsoleStorage(page)).toContain('Pro Lab');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL('/catalog/licenses');
  await page.goto('/catalog/licenses/versions/pro-v2');
  await form.expectLoaded('Pro');
  await expect(recovery.offer()).toHaveCount(0);
});
