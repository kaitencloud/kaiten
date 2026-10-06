import { expect, test } from '../_support/app-test';
import { expectNoAccessibilityViolations } from '../_support/assertions/accessibility';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { FeatureFlagsListDriver } from '../_support/drivers/feature-flags-list.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { ReleaseManagementTabsDriver } from '../_support/drivers/release-management-tabs.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installDashboardAppMocks } from '../_support/mocks/install-dashboard-app-mocks';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installReleaseManagementAppMocks } from '../_support/mocks/install-release-management-app-mocks';
import {
  createBillingDisabledModel,
  createBillingOutageModel,
} from '../billing/billing.scenarios';
import { createCustomersListModel } from '../customers/customers.scenarios';
import { createDashboardReadModel } from '../dashboard/dashboard.scenarios';
import { createEntitlementsListModel } from '../entitlements/entitlements.scenarios';
import { createFeatureFlagsListModel } from '../feature-flags/feature-flags.scenarios';
import { createInstancesListModel } from '../instances/instances.scenarios';
import { createReleaseManagementReadModel } from '../release-management/release-management.scenarios';

test.describe('accessibility smoke', () => {
  test('dashboard has no WCAG A/AA violations', async ({ page }) => {
    const model = createDashboardReadModel();

    await installDashboardAppMocks(page, model);
    await page.goto('/dashboard');

    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('customers list has no WCAG A/AA violations', async ({ page }) => {
    const model = createCustomersListModel();
    const list = new CustomersListDriver(page);

    await installCustomerAppMocks(page, model);
    await list.goto();

    await expectNoAccessibilityViolations(page);
  });

  test('feature flags list has no WCAG A/AA violations', async ({ page }) => {
    const model = createFeatureFlagsListModel();
    const list = new FeatureFlagsListDriver(page);

    await installFeatureFlagAppMocks(page, model);
    await list.goto();

    await expectNoAccessibilityViolations(page);
  });

  test('release-management workspace has no WCAG A/AA violations', async ({
    page,
  }) => {
    const model = createReleaseManagementReadModel();
    const tabs = new ReleaseManagementTabsDriver(page);

    await installReleaseManagementAppMocks(page, model);
    await page.goto('/releases');
    await tabs.expectVisible();
    await expect(
      page.getByRole('heading', { name: 'Releases', level: 1 }),
    ).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });

  test('instances list has no WCAG A/AA violations', async ({ page }) => {
    const model = createInstancesListModel();
    const list = new InstancesListDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();

    await expectNoAccessibilityViolations(page);
  });

  test('entitlements list has no WCAG A/AA violations', async ({ page }) => {
    const model = createEntitlementsListModel();
    const list = new EntitlementsListDriver(page);

    await installEntitlementAppMocks(page, model);
    await list.goto();

    await expectNoAccessibilityViolations(page);
  });

  for (const [name, model, reason] of [
    [
      'billing is off',
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
      'DEPLOYMENT_DISABLED',
    ],
    [
      'the session lacks the scope of billing',
      createBillingOutageModel('missingScope'),
      'MISSING_SCOPE',
    ],
  ] as const) {
    test(`the explanation of a billing link has no WCAG A/AA violations when ${name}`, async ({
      page,
    }) => {
      const nav = new BillingNavDriver(page);
      await installBillingAppMocks(page, model);

      await page.goto('/billing/invoices');

      await nav.expectUnavailable(reason);
      await expectNoAccessibilityViolations(page);
    });
  }
});
