import { devices } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installDashboardAppMocks } from '../_support/mocks/install-dashboard-app-mocks';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createCustomersListModel } from '../customers/customers.scenarios';
import { createDashboardReadModel } from '../dashboard/dashboard.scenarios';
import { createFeatureFlagsListModel } from '../feature-flags/feature-flags.scenarios';

// Pixel 5 viewport for the entire describe — 393x851 with touch + mobile UA.
// Activates the responsive layout that real users see on small screens.
// Kept narrow on purpose: smoke-level coverage, not a full mobile suite.
test.use({ ...devices['Pixel 5'] });

test.describe('mobile (Pixel 5) read smoke', () => {
  test('dashboard renders core metrics on mobile', async ({ page }) => {
    const model = createDashboardReadModel();

    await installDashboardAppMocks(page, model);
    await page.goto('/dashboard');

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
  });

  test('customers list is reachable and readable on mobile', async ({
    page,
  }) => {
    const model = createCustomersListModel();
    const list = new CustomersListDriver(page);

    await installCustomerAppMocks(page, model);
    await list.goto();

    await list.expectCustomerVisible('Acme Corp');
    await list.expectCustomerVisible('Beta Industries');
  });

  test('feature flags list renders rows on mobile', async ({ page }) => {
    const model = createFeatureFlagsListModel();
    const list = new FeatureFlagsListDriver(page);

    await installFeatureFlagAppMocks(page, model);
    await list.goto();

    await list.expectFlagVisibleInTable('Beta Access');
    await list.expectFlagVisibleInTable('Homepage Redesign');
  });
});
