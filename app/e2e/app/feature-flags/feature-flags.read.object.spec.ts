import { expect, test } from '../_support/app-test';
import { FeatureFlagDetailDriver } from '../_support/drivers/feature-flag-detail.driver';
import { FeatureFlagTryItDriver } from '../_support/drivers/feature-flag-try-it.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createObjectFeatureFlagModel } from './feature-flags.scenarios';

test('displays an object feature flag with object variants and evaluates correctly', async ({
  page,
}) => {
  const model = createObjectFeatureFlagModel();
  const list = new FeatureFlagsListDriver(page);
  const detail = new FeatureFlagDetailDriver(page);
  const tryIt = new FeatureFlagTryItDriver(page);

  await installFeatureFlagAppMocks(page, model);
  await list.goto();

  await list.expectFlagVisibleInTable('API Configuration');
  await list.openFlag('API Configuration');

  await expect(page).toHaveURL('/feature-flags/api-config');
  await detail.expectLoaded('API Configuration');

  // Variants tab — object variant names visible
  await detail.openTab('Variants');
  await detail.expectVariantVisible('production');
  await detail.expectVariantVisible('staging');

  // Targeting tab — basic rule for staging
  await detail.openTab('Targeting');
  await detail.expectTargetingRuleVisible('Internal QA');

  // Try it — evaluate with a valid non-staging context → returns default "production" variant
  await detail.openTryIt();
  await tryIt.fillContext('{\n  "targetingKey": "user-123"\n}');
  await tryIt.evaluate();
  await tryIt.expectResultVariant('production');
  await tryIt.close();
});
