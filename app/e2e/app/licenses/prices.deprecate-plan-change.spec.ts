import { expect, test } from '../_support/app-test';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  createLifecycleLicensesModel,
} from '../billing/lifecycle-world';

// A price that a plan change is scheduled to move to cannot be deprecated until the
// change is cancelled. The refusal is the API's own words, which name no instance: the
// console looks for the instances concerned among the subscriptions, and leads to the
// Billing tab of each, where the change is told and can be cancelled.

const PLAN_CHANGE_TARGET = {
  code: 'DeprecateLicensePrice.PlanChangeTarget',
  detail: 'a plan change is scheduled to this price: cancel it first',
  status: 409,
} as const;

test.describe('deprecating a price a plan change moves to', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-07T12:00:00.000Z'));
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());
  });

  test('says what the API said and lists the instances scheduled to move to the price, each with the way to its subscription', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const model = createLifecycleLicensesModel();
    model.setNextProblem('deprecatePrice', PLAN_CHANGE_TARGET);
    await installLicenseAppMocks(page, model);
    await prices.goto('pro-v3', 'Pro');

    await prices.deprecate('Pro v3, monthly').click();
    await prices.confirmDeprecation();

    const dialog = prices.deprecateDialog();
    await expect(dialog.getByRole('alert')).toContainText(
      'a plan change is scheduled to this price: cancel it first',
    );
    // Found among the subscriptions, since the refusal names none.
    const instances = dialog.getByTestId('plan-change-instances');
    await expect(instances).toContainText(
      'These instances are scheduled to move to this price.',
    );
    await expect(instances.getByRole('link')).toHaveText(['Initech Moving']);
    await expect(instances).toContainText('(Initech, from Oct 15, 2026 (UTC))');
    // Refused: nothing was deprecated, and the dialog stays for the person to read.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(prices.deprecateDialog()).toHaveCount(0);
    await expect(prices.status('Pro v3, monthly')).toHaveText('Active');
  });

  test('leads to the Billing tab of the instance, where the change is told and can be cancelled', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const model = createLifecycleLicensesModel();
    model.setNextProblem('deprecatePrice', PLAN_CHANGE_TARGET);
    await installLicenseAppMocks(page, model);
    await prices.goto('pro-v3', 'Pro');
    await prices.deprecate('Pro v3, monthly').click();
    await prices.confirmDeprecation();

    await prices
      .deprecateDialog()
      .getByTestId('plan-change-instances')
      .getByRole('link', { name: 'Initech Moving' })
      .click();

    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-moving\/billing$/,
    );
    await expect(lifecycle.scheduledChangeNotice()).toContainText(
      'Changes to Pro v3 ($39.00/month) on Oct 15, 2026 (UTC)',
    );
    await expect(lifecycle.dropChangeButton()).toBeVisible();
    await expect(new InstanceBillingDriver(page).tab()).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('says nothing more than the API said when the session may not read subscriptions', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const model = createLifecycleLicensesModel();
    model.setNextProblem('deprecatePrice', PLAN_CHANGE_TARGET);
    await signInWithScopes(page, [
      'read:licenses',
      'write:licenses',
      'read:instances',
    ]);
    await installLicenseAppMocks(page, model);
    await prices.goto('pro-v3', 'Pro');

    await prices.deprecate('Pro v3, monthly').click();
    await prices.confirmDeprecation();

    const dialog = prices.deprecateDialog();
    await expect(dialog.getByRole('alert')).toContainText(
      'a plan change is scheduled to this price',
    );
    await expect(dialog.getByTestId('plan-change-instances')).toHaveCount(0);
    await expect(
      dialog.getByText('Looking for the instances concerned…'),
    ).toHaveCount(0);
  });

  test('deprecates the price when no plan change moves to it, as before', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.admin);
    await installLicenseAppMocks(page, createLifecycleLicensesModel());
    await prices.goto('pro-v3', 'Pro');

    await prices.deprecate('Pro v3, monthly').click();
    await prices.confirmDeprecation();

    await expect(prices.status('Pro v3, monthly')).toHaveText('Deprecated');
    await expect(prices.deprecateDialog()).toHaveCount(0);
  });
});
