import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  createLifecycleLicensesModel,
} from '../billing/lifecycle-world';

// The life of a subscription as a person who cannot use a mouse or a screen meets it:
// no violation on the tab in any of its states, in either theme; each dialog keeping
// the focus inside while it is open and closing on Escape; a refusal announced where
// it is shown; the way to a dialog reachable and operable by the keyboard.

test.describe('accessibility of the states of a subscription', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());
  });

  for (const [slug, notice] of [
    ['initech-trial', 'trial-notice'],
    ['initech-late', 'past-due-notice'],
    ['initech-leaving', 'cancellation-notice'],
    ['initech-moving', 'scheduled-change-notice'],
  ] as const) {
    test(`the tab of ${slug} has no WCAG A/AA violations in either theme`, async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);

      await billing.goto(slug);
      await expect(page.getByTestId(notice)).toBeVisible();
      await expect(new InstanceLifecycleDriver(page).actions()).toBeVisible();
      await settle(page);
      await expectNoAccessibilityViolations(page);

      await useLightTheme(page);
      await expectNoAccessibilityViolations(page);
    });
  }

  test('the tab of a subscription that ended has none either', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('hooli-prod');
    await expect(billing.subscribeLink()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the button that is greyed out stays in the tab order, and says why to whoever reaches it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-trial');
    const wrapper = lifecycle.changePlanButton().locator('xpath=..');

    await expect(wrapper).toHaveAttribute('tabindex', '0');
    await wrapper.focus();
    await expect(page.getByText('Unavailable during a trial')).toBeVisible();
  });

  test('the way to the cancellation is a link the keyboard reaches and opens, and Escape leads back to the tab', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-prod');
    await lifecycle.cancelLink().focus();
    await page.keyboard.press('Enter');

    await expect(
      lifecycle.dialog().getByRole('heading', {
        name: 'Cancel the subscription of Initech Production',
      }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(lifecycle.dialog()).toHaveCount(0);
    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing$/,
    );
  });
});

test.describe('accessibility of the dialogs of the life of a subscription', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('the dialog that cancels is accessible, with what it offers beside the cancellation', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await billing.goto('initech-seats');
    await lifecycle.openCancel('Initech Seats');
    await lifecycle.removeAddonsCheckbox().check();
    await lifecycle.setEndDateCheckbox().check();
    await expect(lifecycle.endDateField()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectDialogAccessible(page, lifecycle.dialog());
  });

  test('the warning of an immediate cancellation is accessible in both themes', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');
    await lifecycle.chooseCancelMode('Immediately');
    await expect(lifecycle.cancelExplanation()).toContainText(
      'This cannot be undone',
    );
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('a refusal of the cancellation is announced where it is shown, and takes the focus', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('cancelSubscription', {
      code: 'CancelSubscription.NotActive',
      detail: 'the subscription is already canceled',
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');

    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.alert()).toBeFocused();
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });

  test('what the dialog says once it has cancelled takes the focus the button had, and is accessible', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');

    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.canceled()).toBeFocused();
    await expectDialogAccessible(page, lifecycle.dialog());
  });

  test('the dialog that changes the plan is accessible, with a change already scheduled', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await billing.goto('initech-moving');
    await lifecycle.openPlanChange('Initech Moving');
    await expect(lifecycle.planField()).toBeVisible();
    await expect(lifecycle.scheduledSummary()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectDialogAccessible(page, lifecycle.dialog());
  });

  test('the dialog that changes the terms is accessible, with a refusal on the field', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('updateInstanceBilling', {
      code: 'UpdateInstanceBilling.InvalidDaysUntilDue',
      detail: 'daysUntilDue must be between 0 and 365',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');
    await lifecycle.daysField().fill('45');
    await lifecycle.saveTermsButton().click();
    await expect(lifecycle.dialog()).toContainText(
      'daysUntilDue must be between 0 and 365',
    );
    await expect(lifecycle.daysField()).toHaveAttribute('aria-invalid', 'true');
    await settle(page);

    await lifecycle.daysField().focus();
    await expectDialogAccessible(page, lifecycle.dialog());
  });

  test('the dialog that subscribes with a trial is accessible', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await billing.goto('initech-fresh');
    await billing.openSubscribe();
    await expect(billing.trialDaysField()).toHaveValue('14');
    await settle(page);

    await expectDialogAccessible(page, billing.dialog());
  });
});

test.describe('accessibility of the public listing of the licenses', () => {
  test.beforeEach(async ({ page }) => {
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());
  });

  test('the list, with a switch and a badge on each family, has no violation in either theme', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    await installLicenseAppMocks(page, createLifecycleLicensesModel());

    await licenses.goto();
    await expect(licenses.publicSwitch('Enterprise')).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('each switch is named after its family, so that a list of them is not a list of the same name', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    await installLicenseAppMocks(page, createLifecycleLicensesModel());

    await licenses.goto();

    await expect(page.getByRole('switch')).toHaveCount(2);
    await expect(licenses.publicSwitch('Enterprise')).toBeVisible();
    await expect(licenses.publicSwitch('Pro')).toBeVisible();
  });

  test('the refusal to deprecate a price a plan change moves to is an accessible dialog, with the instances it names', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const model = createLifecycleLicensesModel();
    model.setNextProblem('deprecatePrice', {
      code: 'DeprecateLicensePrice.PlanChangeTarget',
      detail: 'a plan change is scheduled to this price: cancel it first',
      status: 409,
    });
    await installLicenseAppMocks(page, model);
    await prices.goto('pro-v3', 'Pro');
    await prices.deprecate('Pro v3, monthly').click();
    await prices.confirmDeprecation();
    await expect(
      prices.deprecateDialog().getByTestId('plan-change-instances'),
    ).toBeVisible();

    await settle(page);
    await expectNoAccessibilityViolations(page);
  });
});
