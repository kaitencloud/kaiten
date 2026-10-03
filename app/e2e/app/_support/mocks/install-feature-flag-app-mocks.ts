import type { Page } from '@playwright/test';
import type { FeatureFlagAppModel } from '../model/feature-flag-app-model';
import { installMswMocks } from './install-app-mocks';

export function installFeatureFlagAppMocks(
  page: Page,
  model: FeatureFlagAppModel,
) {
  return installMswMocks(page, 'featureFlags', model);
}
