import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createEmptyEntitlementsModel,
  createIconedEntitlementModel,
} from './entitlements.scenarios';

test('selects a Lucide icon when creating an entitlement', async ({ page }) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Storage Reads' });
  await form.selectIcon('anchor');

  // The trigger reflects the selected icon name.
  await expect(form.iconPickerTrigger()).toContainText('anchor');

  await form.clickNext();
  await form.submitButton().click();

  await expect(page).toHaveURL('/entitlements/storage-reads');
  await list.goto();
  await list.expectEntitlementVisible('Storage Reads');
});

test('pre-fills the icon picker when editing an entitlement that has one', async ({
  page,
}) => {
  const model = createIconedEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/entitlements/priority-support?mode=configure');

  await expect(
    page.getByRole('heading', { name: 'Edit Entitlement' }).first(),
  ).toBeVisible();
  await expect(form.iconPickerTrigger()).toContainText('anchor');
});
