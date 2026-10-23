import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { createThresholdEntitlementModel } from './entitlements.scenarios';

// The API replaces an entitlement on every PUT and stores 0 for a numeric one sent
// without `warningThresholdPercent` (the warning is off). No screen has a field for
// it, so every update echoes the stored value; without that, an edit of anything else
// would drop it. The mock behaves like the API, which is what makes these tests mean
// something.
test('keeps the early-warning threshold when another field is edited', async ({
  page,
}) => {
  const model = createThresholdEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/catalog/entitlements/api-calls?mode=configure');
  await form.descriptionField().fill('API calls included in every plan');
  await form.clickNext();
  await form.updateButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/api-calls');

  const stored = await page.evaluate(async () =>
    (await fetch('/api/entitlements/api-calls')).json(),
  );
  expect(stored.warningThresholdPercent).toBe(80);
});

test('keeps the early-warning threshold when the entitlement is renamed in place', async ({
  page,
}) => {
  const model = createThresholdEntitlementModel();

  await installEntitlementAppMocks(page, model);
  await page.goto('/catalog/entitlements/api-calls');
  // The title is a button named by the name it shows; once open, the field is named by the action.
  await page.getByRole('button', { name: 'API Calls' }).click();
  await page
    .getByRole('textbox', { name: 'Edit name' })
    .fill('API calls (renamed)');
  await page.keyboard.press('Enter');
  // The title is a button again once the rename is saved and read back.
  await expect(
    page.getByRole('button', { name: 'API calls (renamed)' }),
  ).toBeVisible();

  const stored = await page.evaluate(async () =>
    (await fetch('/api/entitlements/api-calls')).json(),
  );
  expect(stored.name).toBe('API calls (renamed)');
  expect(stored.warningThresholdPercent).toBe(80);
});
