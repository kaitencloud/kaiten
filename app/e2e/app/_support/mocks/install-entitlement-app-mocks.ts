import type { Page } from '@playwright/test';
import type { EntitlementAppModel } from '../model/entitlement-app-model';
import { installMswMocks } from './install-app-mocks';

export function installEntitlementAppMocks(
  page: Page,
  model: EntitlementAppModel,
) {
  return installMswMocks(page, 'entitlements', model);
}
