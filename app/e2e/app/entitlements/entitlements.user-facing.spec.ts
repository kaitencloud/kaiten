import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createDeletableEntitlementModel,
  createEmptyEntitlementsModel,
} from './entitlements.scenarios';

test('creates a user-facing entitlement', async ({ page }) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Public Feature' });
  await expect(form.userFacingToggle()).not.toBeChecked();
  await form.userFacingToggle().click();
  await form.clickNext();
  await form.submitButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/public-feature');

  // Round-trip: the configure wizard reflects the stored flag on its first step.
  await page.goto('/catalog/entitlements/public-feature?mode=configure');
  await expect(form.userFacingToggle()).toBeChecked();
});

test('defaults to not user facing and can be enabled on edit', async ({
  page,
}) => {
  const model = createDeletableEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/catalog/entitlements/priority-support?mode=configure');

  await expect(form.userFacingToggle()).not.toBeChecked();
  await form.userFacingToggle().click();
  // A BOOLEAN entitlement has no type step, so the update button lives on the
  // single identity step — no need to advance the wizard.
  await form.updateButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/priority-support');

  await page.goto('/catalog/entitlements/priority-support?mode=configure');
  await expect(form.userFacingToggle()).toBeChecked();
});
