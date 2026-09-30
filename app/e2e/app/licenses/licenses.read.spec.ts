import { expect, test } from '../_support/app-test';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createLicenseCatalogModel } from './licenses.scenarios';

test('lists a family with the lifecycle state and transition of each version', async ({
  page,
}) => {
  const list = new LicensesListDriver(page);

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await list.goto();
  await list.expandFamily('Starter');

  await list.expectVersionState('Starter', 'Legacy', 'Archived');
  await list.expectVersionState('Starter', 'GA', 'Published');
  await list.expectVersionState('Starter', 'Spring', 'Published');
  await list.expectVersionState('Starter', 'Next', 'Draft');

  // Each version offers the one transition its state accepts.
  await expect(
    list.lifecycleAction('Starter', 'Legacy', 'Unarchive'),
  ).toBeEnabled();
  await expect(
    list.lifecycleAction('Starter', 'Spring', 'Archive'),
  ).toBeEnabled();
  await expect(
    list.lifecycleAction('Starter', 'Next', 'Publish'),
  ).toBeEnabled();
  // The family's default cannot be archived.
  await expect(list.lifecycleAction('Starter', 'GA', 'Archive')).toBeDisabled();
});
