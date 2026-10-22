import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { createThresholdEntitlementModel } from './entitlements.scenarios';

// The API replaces an entitlement on every PUT and stores 0 for a numeric one sent
// without `warningThresholdPercent` (the warning is off). The configure form has no
// field for it and does not send the stored value back, so an edit of anything else
// drops the threshold. The mock now behaves like the API, which makes the defect
// visible here; this test states the behaviour to reach and is skipped until the
// form echoes the threshold.
test.fixme('keeps the early-warning threshold when another field is edited', async ({
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
