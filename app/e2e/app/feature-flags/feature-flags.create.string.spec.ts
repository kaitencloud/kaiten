import { expect, test } from '../_support/app-test';
import { FeatureFlagFormDriver } from '../_support/drivers/feature-flag-form.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createEmptyFeatureFlagsModel } from './feature-flags.scenarios';

test('creates a string feature flag with multiple variants', async ({
  page,
}) => {
  const model = createEmptyFeatureFlagsModel();
  const list = new FeatureFlagsListDriver(page);
  const form = new FeatureFlagFormDriver(page);

  await installFeatureFlagAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();

  await expect(page).toHaveURL('/feature-flags/new');

  // Create is a guided stepper; walk basic info -> variants -> default
  // variant -> targeting before submitting on the final step.
  await form.fillGeneralStep({
    description: 'Controls which onboarding flow the user sees',
    name: 'Onboarding Flow',
  });
  await form.clickNext(); // -> variants (boolean default variants exist)
  await form.clickNext(); // -> default variant
  await form.chooseDefaultVariantStep('true');
  await form.clickNext(); // -> targeting

  await form.createButton().click();

  await expect(page).toHaveURL('/feature-flags');
  await list.expectFlagVisibleInTable('Onboarding Flow');
});
