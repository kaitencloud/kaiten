import type { Page } from '@playwright/test';
import type { ReleaseManagementAppModel } from '../model/release-management-app-model';
import { installMswMocks } from './install-app-mocks';

export function installReleaseManagementAppMocks(
  page: Page,
  model: ReleaseManagementAppModel,
) {
  return installMswMocks(page, 'releaseManagement', model);
}
