import { expect, expectErrorToast, test } from '../_support/app-test';
import { FeatureFlagFormDriver } from '../_support/drivers/feature-flag-form.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createEmptyFeatureFlagsModel } from './feature-flags.scenarios';

test.describe('feature-flags errors', () => {
  test('shows an error toast when feature flag creation fails with a server error', async ({
    page,
  }) => {
    const model = createEmptyFeatureFlagsModel();
    const list = new FeatureFlagsListDriver(page);
    const form = new FeatureFlagFormDriver(page);

    // Arm the next create call to fail with a 500
    model.setNextError('create', 500);

    await installFeatureFlagAppMocks(page, model);
    await list.goto();
    await list.openCreatePage();

    await form.fillGeneralStep({
      description: 'Controls the checkout guardrails rollout',
      name: 'Checkout Guardrails',
    });
    await form.clickNext(); // -> variants
    await form.clickNext(); // -> default variant
    await form.chooseDefaultVariantStep('true');
    await form.clickNext(); // -> targeting
    await form.createButton().click();

    // The app must show an error toast — flag must not appear in the list
    await expectErrorToast(page);
    await expect(page).toHaveURL('/feature-flags/new');
    await list.goto();
    await list.expectFlagHiddenInTable('Checkout Guardrails');
  });
});
