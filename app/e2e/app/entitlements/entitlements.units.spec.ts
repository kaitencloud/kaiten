import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createEmptyEntitlementsModel,
  createUnitEntitlementModel,
} from './entitlements.scenarios';

test('creates an entitlement sold in a different unit', async ({ page }) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Seats' });
  await form.clickNext();
  await form.fillUnits({
    unitSingular: 'seat',
    unitPlural: 'seats',
    saleUnitSingular: 'pack',
    saleUnitPlural: 'packs',
    saleUnitFactor: 3,
  });
  await form.submitButton().click();
  await expect(page).toHaveURL('/entitlements/seats');

  // Round-trip: the configure wizard reflects the stored unit configuration
  // on its type step.
  await page.goto('/entitlements/seats?mode=configure');
  await form.clickNext();
  await expect(form.unitSingularField()).toHaveValue('seat');
  await expect(form.unitPluralField()).toHaveValue('seats');
  await expect(form.saleUnitsToggle()).toBeChecked();
  await expect(form.saleUnitSingularField()).toHaveValue('pack');
  await expect(form.saleUnitPluralField()).toHaveValue('packs');
  await expect(form.saleUnitFactorField()).toHaveValue('3');
});

test('pre-fills unit fields when editing an entitlement that has them', async ({
  page,
}) => {
  const model = createUnitEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/entitlements/seats?mode=configure');

  await expect(
    page.getByRole('heading', { name: 'Edit Entitlement' }).first(),
  ).toBeVisible();
  await form.clickNext();
  await expect(form.unitSingularField()).toHaveValue('seat');
  await expect(form.unitPluralField()).toHaveValue('seats');
  await expect(form.saleUnitsToggle()).toBeChecked();
  await expect(form.saleUnitSingularField()).toHaveValue('pack');
  await expect(form.saleUnitPluralField()).toHaveValue('packs');
  await expect(form.saleUnitFactorField()).toHaveValue('3');
});

test('clears the sale unit trio when the toggle is switched off', async ({
  page,
}) => {
  const model = createUnitEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/entitlements/seats?mode=configure');
  await form.clickNext();

  await expect(form.saleUnitsToggle()).toBeChecked();
  await form.saleUnitsToggle().click();
  await expect(form.saleUnitsToggle()).not.toBeChecked();

  await form.updateButton().click();
  await expect(page).toHaveURL('/entitlements/seats');

  await page.goto('/entitlements/seats?mode=configure');
  await form.clickNext();
  await expect(form.saleUnitsToggle()).not.toBeChecked();
  await expect(form.unitSingularField()).toHaveValue('seat');
  await expect(form.unitPluralField()).toHaveValue('seats');
});
