import { expect, test } from '../_support/app-test';
import { FeatureFlagFormDriver } from '../_support/drivers/feature-flag-form.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createEmptyFeatureFlagsModel } from './feature-flags.scenarios';

test('creates a feature flag from the list page', async ({ page }) => {
  const model = createEmptyFeatureFlagsModel();
  const list = new FeatureFlagsListDriver(page);
  const form = new FeatureFlagFormDriver(page);

  await installFeatureFlagAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();

  await expect(page).toHaveURL('/feature-flags/new');
  await expect(
    page.getByRole('heading', { name: 'New Feature Flag' }),
  ).toBeVisible();

  // Create is a guided stepper: basic info -> variants -> default variant ->
  // targeting, with the submit button only on the last step.
  await form.fillGeneralStep({
    description: 'Controls the checkout guardrails rollout',
    name: 'Checkout Guardrails',
  });
  await form.clickNext(); // -> variants
  await form.clickNext(); // -> default variant
  await form.chooseDefaultVariantStep('true');
  await form.clickNext(); // -> targeting
  await form.createButton().click();

  await expect(page).toHaveURL('/feature-flags');
  await list.expectFlagVisibleInTable('Checkout Guardrails');
});
