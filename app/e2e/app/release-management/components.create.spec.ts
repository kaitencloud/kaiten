import {
  expect,
  expectDialogClosed,
  expectToast,
  test,
} from '../_support/app-test';
import { installReleaseManagementAppMocks } from '../_support/mocks/install-release-management-app-mocks';
import { createComponentsCatalogModel } from './release-management.scenarios';

test('creates a component from the release-management catalog', async ({
  page,
}) => {
  const model = createComponentsCatalogModel();

  await installReleaseManagementAppMocks(page, model);
  await page.goto('/releases/components');

  await expect(
    page.getByRole('heading', { name: 'Components', level: 1 }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Create Component', exact: true })
    .click();

  await expect(page).toHaveURL('/releases/components/new');
  await expect(
    page.getByRole('heading', { name: 'Create Component' }),
  ).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Billing API');
  await page.getByLabel('Version', { exact: true }).fill('v3.2.0');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Handles billing plans, invoices, and reconciliation workflows');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expectToast(page, 'Component created successfully');
  await expect(page).toHaveURL('/releases/components');
  await expectDialogClosed(page);
  await page.goto('/releases/components');
  await expect(
    page.getByText('Billing API', { exact: true }).first(),
  ).toBeVisible();
});
