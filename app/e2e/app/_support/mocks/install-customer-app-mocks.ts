import type { Page } from '@playwright/test';
import type { CustomerAppModel } from '../model/customer-app-model';
import { installMswMocks } from './install-app-mocks';

export function installCustomerAppMocks(page: Page, model: CustomerAppModel) {
  return installMswMocks(page, 'customers', model);
}
