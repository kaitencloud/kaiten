import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createDeletableEntitlementModel,
  createEmptyEntitlementsModel,
} from './entitlements.scenarios';

test('creates an entitlement with a display order', async ({ page }) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Ordered Feature' });
  await expect(form.displayOrderField()).toHaveValue('0');
  await form.displayOrderField().fill('25');
  await form.clickNext();
  await form.submitButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/ordered-feature');

  // Round-trip: the configure wizard reflects the stored order on its first step.
  await page.goto('/catalog/entitlements/ordered-feature?mode=configure');
  await expect(form.displayOrderField()).toHaveValue('25');
});

test('clearing the display order field keeps the form submittable (saves 0)', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Cleared Order' });
  // Clearing the number input yields NaN internally; the form must stay
  // submittable and persist the default order of 0.
  await form.displayOrderField().fill('');
  await form.clickNext();
  await form.submitButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/cleared-order');

  await page.goto('/catalog/entitlements/cleared-order?mode=configure');
  await expect(form.displayOrderField()).toHaveValue('0');
});

test('defaults display order to 0 and can be changed on edit', async ({
  page,
}) => {
  const model = createDeletableEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/catalog/entitlements/priority-support?mode=configure');

  await expect(form.displayOrderField()).toHaveValue('0');
  await form.displayOrderField().fill('3');
  // A BOOLEAN entitlement has no type step, so the update button lives on the
  // single identity step — no need to advance the wizard.
  await form.updateButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/priority-support');

  await page.goto('/catalog/entitlements/priority-support?mode=configure');
  await expect(form.displayOrderField()).toHaveValue('3');
});
