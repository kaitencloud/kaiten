import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createEmptyEntitlementsModel,
  createPeriodicEntitlementModel,
} from './entitlements.scenarios';

test('creates an entitlement whose usage resets every month', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'API Calls' });
  await form.clickNext();
  await form.selectResetPeriod('Every month');
  await form.selectResetAnchor('License start date');
  await form.submitButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/api-calls');

  // Round-trip: the stored cadence comes back, and the one-way door has shut.
  await page.goto('/catalog/entitlements/api-calls?mode=configure');
  await form.clickNext();
  await expect(form.resetPeriodTrigger()).toContainText('Every month');
  await expect(form.resetAnchorTrigger()).toContainText('License start date');
  await expect(form.resetPeriodTrigger()).toBeDisabled();
  await expect(form.resetAnchorTrigger()).toBeDisabled();
});

// The regression entitlementToUpdateBody and resolveResetFields both exist to
// prevent: a full-replace PUT that drops the pair reads as an attempted
// removal. The app model rejects that, so this fails loudly if either path
// stops echoing the stored window back.
test('keeps the stored window when editing a periodic entitlement', async ({
  page,
}) => {
  const model = createPeriodicEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/catalog/entitlements/api-calls?mode=configure');

  await form.fill({ name: 'API Calls Renamed' });
  await form.clickNext();
  await form.updateButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/api-calls');

  await page.goto('/catalog/entitlements/api-calls?mode=configure');
  await form.clickNext();
  await expect(form.resetPeriodTrigger()).toContainText('Every month');
  await expect(form.resetAnchorTrigger()).toContainText('Calendar');
});
