import { expect, recordWrites, test } from '../_support/app-test';
import { expectNoAccessibilityViolations } from '../_support/assertions/accessibility';
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

  await expect(page).toHaveURL('/catalog/entitlements/new');
  await form.expectLoaded('create');

  await form.fill({
    description: 'Tracks the number of storage reads per billing period',
    name: 'Storage Reads',
  });
  await form.clickNext();
  await form.submitButton().click();

  // Creating lands on the new entitlement, not back on the list.
  await expect(page).toHaveURL('/catalog/entitlements/storage-reads');
  await list.goto();
  await list.expectEntitlementVisible('Storage Reads');
});

test('names the groups field by its label, so that a screen reader can say what it is', async ({
  page,
}) => {
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, createEmptyEntitlementsModel());
  await page.goto('/catalog/entitlements/new');
  await form.expectLoaded('create');

  const groups = page.getByRole('combobox', { name: 'Groups' });
  await expect(groups).toBeVisible();
  await expect(groups).toHaveAccessibleDescription(/group/i);
  await expectNoAccessibilityViolations(page);
});

// Where the usage of a number comes from is a choice of its own: calculated, which is every
// entitlement that exists, unless it is chosen to be the sum of others.
test('creates a number whose usage is calculated unless the form says otherwise', async ({
  page,
}) => {
  const form = new EntitlementFormDriver(page);
  const writes = recordWrites(page, /\/api\/entitlements$/);

  await installEntitlementAppMocks(page, createEmptyEntitlementsModel());
  await page.goto('/catalog/entitlements/new');
  await form.fill({ name: 'Storage Reads' });
  await form.clickNext();

  await expect(form.usageSourceTrigger()).toContainText('Calculated');
  await expect(form.usageSourceTrigger()).toBeEnabled();
  // Nothing of a combined entitlement is asked: no sources, and its own window and aggregation.
  await expect(form.sourceRows()).toHaveCount(0);
  await expect(form.aggregationTrigger()).toBeEnabled();
  await expect(form.resetPeriodTrigger()).toBeEnabled();
  await form.submitButton().click();

  await expect(page).toHaveURL('/catalog/entitlements/storage-reads');
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    type: 'NUMBER',
    usageSource: 'CALCULATED_USAGE',
  });
  expect(writes[0].body).not.toHaveProperty('sources');
});

test('says nothing of where the usage comes from for a flag, which has none', async ({
  page,
}) => {
  const form = new EntitlementFormDriver(page);
  const writes = recordWrites(page, /\/api\/entitlements$/);

  await installEntitlementAppMocks(page, createEmptyEntitlementsModel());
  await page.goto('/catalog/entitlements/new');
  await form.fill({ name: 'Priority Support' });
  await form.clickNext();
  await page.getByRole('combobox', { name: /^Type/ }).click();
  await page.getByRole('option', { name: 'Boolean', exact: true }).click();

  await expect(form.usageSourceTrigger()).toHaveCount(0);
  await form.submitButton().click();

  await expect(page).toHaveURL('/catalog/entitlements/priority-support');
  expect(writes[0].body).toMatchObject({ type: 'BOOLEAN' });
  expect(writes[0].body).not.toHaveProperty('usageSource');
  expect(writes[0].body).not.toHaveProperty('sources');
});
