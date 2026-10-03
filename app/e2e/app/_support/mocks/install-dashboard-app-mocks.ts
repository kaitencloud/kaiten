import type { Page } from '@playwright/test';
import type { DashboardAppModel } from '../model/dashboard-app-model';
import { installMswMocks } from './install-app-mocks';

export function installDashboardAppMocks(page: Page, model: DashboardAppModel) {
  return installMswMocks(page, 'dashboard', model);
}
