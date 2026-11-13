import type { Page } from '@playwright/test';
import type { BillingAppModel } from '../model/billing-app-model';
import { installMswMocks, updateMswMocks } from './install-app-mocks';

export function installBillingAppMocks(page: Page, model: BillingAppModel) {
  return installMswMocks(page, 'billing', model);
}

export function updateBillingAppMocks(page: Page, model: BillingAppModel) {
  return updateMswMocks(page, 'billing', model);
}
