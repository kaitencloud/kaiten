import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { createEmptyEntitlementsModel } from './entitlements.scenarios';

test('creates an entitlement from its creation page', async ({ page }) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();

  await expect(page).toHaveURL('/entitlements/new');
  await form.expectLoaded('create');

  await form.fill({
    description: 'Tracks the number of storage reads per billing period',
    name: 'Storage Reads',
  });
  await form.clickNext();
  await form.submitButton().click();

  // Creating lands on the new entitlement, not back on the list.
  await expect(page).toHaveURL('/entitlements/storage-reads');
  await list.goto();
  await list.expectEntitlementVisible('Storage Reads');
});
