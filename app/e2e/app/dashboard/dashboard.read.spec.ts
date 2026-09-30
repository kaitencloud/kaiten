import { expect, test } from '../_support/app-test';
import { installGraphQLOperationMocks } from '../_support/mocks/graphql-operation-router';
import { installDashboardAppMocks } from '../_support/mocks/install-dashboard-app-mocks';
import { createDashboardReadModel } from './dashboard.scenarios';

test.describe('dashboard read', () => {
  test('redirects "/" to dashboard and renders metrics', async ({ page }) => {
    const model = createDashboardReadModel();

    await installDashboardAppMocks(page, model);
    await page.goto('/');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    const main = page.locator('main');
    await expect(
      main.getByText('Customers', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      main.getByText('Active Instances', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      main.getByText('Licenses', { exact: true }).first(),
    ).toBeVisible();
    await expect(main.getByText('Error loading dashboard data')).toHaveCount(0);
  });

  test('renders dashboard error state when GraphQL fails', async ({ page }) => {
    // The error test cannot use DashboardAppModel since the intent is to
    // simulate a broken GraphQL response. We route directly to return a
    // GraphQL error payload, which is the only case where a raw page.route()
    // call is justified in a spec file.
    await installGraphQLOperationMocks(page, {
      GetDashboardData: () => {
        throw new Error('mocked dashboard failure');
      },
    });

    await page.goto('/dashboard');

    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await expect(page.getByText('Error loading dashboard data')).toBeVisible({
      timeout: 20_000,
    });
  });
});
