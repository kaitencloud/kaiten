import type { Page } from '@playwright/test';
import type { LicenseAppModel } from '../model/license-app-model';
import { installMswMocks } from './install-app-mocks';

export function installLicenseAppMocks(page: Page, model: LicenseAppModel) {
  return installMswMocks(page, 'licenses', model);
}
