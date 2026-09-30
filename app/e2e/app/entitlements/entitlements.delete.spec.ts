import { expect, test } from '../_support/app-test';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { createDeletableEntitlementModel } from './entitlements.scenarios';

test('deletes an entitlement from the list', async ({ page }) => {
  const model = createDeletableEntitlementModel();
  const list = new EntitlementsListDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();

  await list.expectEntitlementVisible('Priority Support');

  await list.openDeleteDialog('Priority Support');

  // Confirmation dialog
  await expect(page.getByRole('alertdialog')).toBeVisible();

  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await list.expectEntitlementHidden('Priority Support');
});
