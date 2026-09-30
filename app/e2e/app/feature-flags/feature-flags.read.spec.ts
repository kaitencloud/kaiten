import { expect, test } from '../_support/app-test';
import { FeatureFlagDetailDriver } from '../_support/drivers/feature-flag-detail.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createFeatureFlagsListModel } from './feature-flags.scenarios';

test('lists feature flags, filters them, and navigates through detail tabs', async ({
  page,
}) => {
  const model = createFeatureFlagsListModel();
  const list = new FeatureFlagsListDriver(page);
  const detail = new FeatureFlagDetailDriver(page);

  await installFeatureFlagAppMocks(page, model);
  await list.goto();

  await list.expectFlagVisibleInTable('Beta Access');
  await list.expectFlagVisibleInTable('Homepage Redesign');

  await list.search('Homepage');
  await list.expectFlagVisibleInTable('Homepage Redesign');
  await list.expectFlagHiddenInTable('Beta Access');

  await list.search('');
  await list.openFlag('Beta Access');

  await expect(page).toHaveURL('/feature-flags/beta-access');
  await detail.expectLoaded('Beta Access');

  await detail.openTab('Variants');
  await detail.expectVariantVisible('control');
  await detail.expectVariantVisible('beta');

  await detail.openTab('Targeting');
  await detail.expectTargetingRuleVisible('Enterprise Customers');

  await detail.openTab('Try it history');
  await expect(
    page.getByText('No evaluations yet. Run Try it to populate this table.'),
  ).toBeVisible();
});
