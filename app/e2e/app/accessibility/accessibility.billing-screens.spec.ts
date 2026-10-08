import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { UsageHistoryDriver } from '../_support/drivers/usage-history.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createSubscriptionsModel } from '../billing/billing.scenarios';
import { createBillingCustomersModel } from '../customers/customers.scenarios';
import { createBilledInstancesModel } from '../instances/instances.scenarios';

// The billing screens of the instances, the customers and the settings as a person
// who cannot use a mouse or a screen meets them: no violation on the page in either
// theme, each dialog and drawer keeping the focus inside while it is open and
// closing on Escape, and a refusal announced where it is shown.

test.describe('accessibility of the billing of an instance', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('the tab of a subscribed instance has no WCAG A/AA violations, in either theme', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('acme-production');
    await expect(billing.subscriptionCard()).toContainText('Active');
    await expect(billing.wouldHoldBanner()).toBeVisible();
    await expect(billing.invoiceRows()).toHaveCount(2);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the tab of an instance nobody bills, and of one whose version is not on sale, have none either', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('beta-staging');
    await expect(billing.notSubscribed()).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await billing.goto('beta-lab');
    await expect(billing.unavailableReason()).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the preview of the upcoming invoice is an accessible dialog', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('acme-production');
    await billing.viewLinesButton().click();
    const preview = page.getByRole('dialog', { name: 'Upcoming invoice' });
    await expect(preview).toBeVisible();

    await expectDialogAccessible(page, preview);
  });

  test('the dialog that subscribes is accessible, with the notice about the e-mail and with a refusal on a field', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('beta-staging');
    await billing.openSubscribe();
    await expect(billing.billingEmailNotice()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await billing.setStartAt('2099-01-01T00:00');
    await expect(billing.dialog()).toContainText(
      'Billing cannot start in the future',
    );
    await expect(billing.startAtField()).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    // Leaving the field with the error took the focus off: the person is back in the dialog.
    await billing.daysUntilDueField().focus();
    await expectDialogAccessible(page, billing.dialog());
  });

  test('the dialog that subscribes is announced as a dialog by its title', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('beta-staging');
    await billing.openSubscribe();

    await expect(
      page.getByRole('dialog', { name: 'Subscribe Beta Staging' }),
    ).toBeVisible();
  });
});

test.describe('accessibility of the usage history', () => {
  test.beforeEach(async ({ page }) => {
    await new UsageHistoryDriver(page).freezeTime();
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('the drawer has no WCAG A/AA violations in either theme, keeps the focus inside and closes on Escape', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await expect(history.rows()).toHaveCount(100);
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);

    await expectDialogAccessible(page, history.drawer());
  });

  test('the notice for a period beyond the retention, and the empty period, have none', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await history.fromField().fill('2025-01-01');
    await expect(history.outsideRetention()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await history.setPeriod('2026-09-01', '2026-09-05');
    await expect(history.empty()).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('the link on a row names the entitlement it is for', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);

    await history.gotoEntitlements('acme-production');

    await expect(history.link('API Calls')).toBeVisible();
    await expect(history.link('Storage GB')).toBeVisible();
  });
});

test.describe('accessibility of a customer and the settings of billing', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installCustomerAppMocks(page, createBillingCustomersModel());
  });

  test('the page of a customer, with its billing e-mail and its invoices, has none in either theme', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);

    await detail.goto('acme-corp');
    await expect(detail.invoiceRows()).toHaveCount(4);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the settings of billing have none in either theme', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);

    await settings.goto();
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the settings of the organization, with the export of the data, have none', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await settings.gotoSettings();
    await expect(settings.exportCard()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });
});

test.describe('accessibility of the refusals to delete', () => {
  test('the dialog that says what keeps an instance is accessible', async ({
    page,
  }) => {
    const list = new InstancesListDriver(page);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await list.goto();
    await list.openDeleteDialog('Acme Legacy');
    await page.getByRole('button', { name: 'Confirm' }).click();
    const refusal = page.getByRole('dialog', {
      name: 'This instance cannot be deleted',
    });
    await expect(refusal).toBeVisible();

    await expectDialogAccessible(page, refusal);
  });
});
