import { expect, expectToast, test } from '../_support/app-test';
import {
  expectTrackedEvent,
  installTrackingCapture,
} from '../_support/assertions/tracking';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createFeatureFlagsListModel } from './feature-flags.scenarios';

test('toggles a feature flag from the list cards view', async ({ page }) => {
  const model = createFeatureFlagsListModel();
  const list = new FeatureFlagsListDriver(page);

  await installTrackingCapture(page);
  await installFeatureFlagAppMocks(page, model);
  await list.goto();
  await list.switchToListView();

  await expect(page).toHaveURL('/feature-flags?view=list');
  await list.expectFlagVisibleInList('Homepage Redesign');

  await list.toggleFromCard('Homepage Redesign');

  await expectToast(page, 'Feature flag enabled successfully');
  await expectTrackedEvent(page, 'feature_flag_toggled', {
    enabled: true,
    featureFlagId: 'feature-flag-homepage-redesign',
    featureFlagSlug: 'homepage-redesign',
    previousEnabled: false,
  });
  await list.expectCardStatusVisible('Homepage Redesign', 'Enabled');
});
