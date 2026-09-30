import { expect, test } from '../_support/app-test';
import { FeatureFlagDetailDriver } from '../_support/drivers/feature-flag-detail.driver';
import { FeatureFlagFormDriver } from '../_support/drivers/feature-flag-form.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createEditableFeatureFlagModel } from './feature-flags.scenarios';

test('updates a feature flag in configure mode and adds a targeting rule', async ({
  page,
}) => {
  const model = createEditableFeatureFlagModel();
  const detail = new FeatureFlagDetailDriver(page);
  const form = new FeatureFlagFormDriver(page);

  await installFeatureFlagAppMocks(page, model);
  await detail.goto('checkout-experiment');
  await detail.expectLoaded('Checkout Experiment');

  await detail.openConfigure();

  await expect(page).toHaveURL(
    /\/feature-flags\/checkout-experiment\?mode=configure$/,
  );
  await expect(form.updateButton()).toBeDisabled();

  await form.fillGeneral({
    description: 'Controls the premium checkout experiment experience',
    name: 'Checkout Experiment Pro',
    slug: 'checkout-experiment-pro',
  });
  await form.openCreateTargetingDialog();
  await form.fillBasicTargeting({
    name: 'Enterprise Cohort',
    rule: 'context.plan == "enterprise"',
    variant: 'express',
  });
  await form.saveTargetingDialog();
  await form.updateButton().click();

  await expect(page).toHaveURL('/feature-flags/checkout-experiment-pro');
  await detail.expectLoaded('Checkout Experiment Pro');

  await detail.openTab('Targeting');
  await detail.expectTargetingRuleVisible('Enterprise Cohort');

  // Cache invalidation: list view must surface the renamed flag and drop the
  // old name. Re-opening the detail must keep the targeting rule visible.
  const list = new FeatureFlagsListDriver(page);
  await list.goto();
  await list.expectFlagVisibleInTable('Checkout Experiment Pro');
  await list.expectFlagHiddenInTable('Checkout Experiment');
  await list.openFlag('Checkout Experiment Pro');
  await detail.expectLoaded('Checkout Experiment Pro');
  await detail.openTab('Targeting');
  await detail.expectTargetingRuleVisible('Enterprise Cohort');
});
