import { expect, test } from '../_support/app-test';
import { FeatureFlagDetailDriver } from '../_support/drivers/feature-flag-detail.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createNumberFeatureFlagModel } from './feature-flags.scenarios';

test('displays a number feature flag with numeric variants', async ({
  page,
}) => {
  const model = createNumberFeatureFlagModel();
  const list = new FeatureFlagsListDriver(page);
  const detail = new FeatureFlagDetailDriver(page);

  await installFeatureFlagAppMocks(page, model);
  await list.goto();

  await list.expectFlagVisibleInTable('Max Upload Size');
  await list.openFlag('Max Upload Size');

  await expect(page).toHaveURL('/feature-flags/max-upload-size');
  await detail.expectLoaded('Max Upload Size');

  // Variants tab — numeric values are displayed
  await detail.openTab('Variants');
  await detail.expectVariantVisible('basic');
  await detail.expectVariantVisible('pro');
  await detail.expectVariantVisible('enterprise');

  // Targeting tab — two basic targeting rules
  await detail.openTab('Targeting');
  await detail.expectTargetingRuleVisible('Pro Users');
  await detail.expectTargetingRuleVisible('Enterprise Users');
});
