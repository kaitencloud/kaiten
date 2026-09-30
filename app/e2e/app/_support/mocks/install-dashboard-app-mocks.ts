import type { Page } from '@playwright/test';
import type { DashboardAppModel } from '../model/dashboard-app-model';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';

export async function installDashboardAppMocks(
  page: Page,
  model: DashboardAppModel,
) {
  if (await tryInstallMswMocks(page, 'dashboard', model)) {
    return;
  }

  await installGraphQLOperationMocks(page, {
    GetDashboardData: () => model.getDashboardData(),
  });
}
