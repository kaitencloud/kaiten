import type { Page } from '@playwright/test';
import type { DashboardAppModel } from '../model/dashboard-app-model';
import { dashboardOperations } from '../model/graphql-operations';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';
import { fulfillJson } from './rest-route-helpers';

export async function installDashboardAppMocks(
  page: Page,
  model: DashboardAppModel,
) {
  if (await tryInstallMswMocks(page, 'dashboard', model)) {
    return;
  }

  await installGraphQLOperationMocks(page, dashboardOperations(model));
  await page.route(/\/api\/service-accounts(?:\?.*)?$/, (route) =>
    fulfillJson(route, 200, { hasMore: false, items: [] }),
  );
}
