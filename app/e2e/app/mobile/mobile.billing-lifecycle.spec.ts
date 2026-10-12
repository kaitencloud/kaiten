import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import { expectNoHorizontalScroll } from '../_support/assertions/layout';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  createLifecycleLicensesModel,
} from '../billing/lifecycle-world';

// The life of a subscription on the narrowest phone the billing screens are checked at:
// the notices and what may be done keep the width of the screen, each dialog fits it
// with its buttons reachable, and the switch of a family stays on it.

const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

/** The element is wholly on the screen: neither of its sides is cut off. */
async function expectWithinScreen(element: Locator) {
  const box = await element.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
}

test.describe('the life of a subscription, on the narrowest phone', () => {
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
    test(`the tab of ${slug} keeps the width of the screen, with its notice and what may be done`, async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);

      await billing.goto(slug);
      await expect(page.getByTestId(notice)).toBeVisible();

      await expectNoHorizontalScroll(page, WIDTH);
      await expectWithinScreen(page.getByTestId(notice));
      await expectWithinScreen(billing.subscriptionCard());
      await expectWithinScreen(lifecycle.actions());
    });
  }

  test('the buttons under the card wrap instead of running off the screen', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-prod');
    await expect(lifecycle.actions()).toBeVisible();

    for (const control of [
      lifecycle.changePlanLink(),
      lifecycle.termsLink(),
      lifecycle.cancelLink(),
    ]) {
      await control.scrollIntoViewIfNeeded();
      await expectWithinScreen(control);
    }
  });

  test('the dialog that cancels fits the screen, with its choices and its confirmation within reach', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-seats');
    await lifecycle.openCancel('Initech Seats');
    await lifecycle.removeAddonsCheckbox().check();
    await lifecycle.setEndDateCheckbox().check();
    await settle(page);

    await expectWithinScreen(lifecycle.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(lifecycle.cancelModeField());
    await expectWithinScreen(lifecycle.reasonField());
    await expectWithinScreen(lifecycle.endDateField());
    await lifecycle.cancelConfirmButton().scrollIntoViewIfNeeded();
    await expectWithinScreen(lifecycle.cancelConfirmButton());
  });

  test('the warning of an immediate cancellation fits too', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');
    await lifecycle.chooseCancelMode('Immediately');
    await settle(page);

    await expectWithinScreen(lifecycle.cancelExplanation());
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the dialog that changes the plan fits the screen, with a long option in its list', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-moving');
    await lifecycle.openPlanChange('Initech Moving');
    await lifecycle.openPlanOptions();
    await settle(page);

    await expectWithinScreen(lifecycle.dialog());
    await expectWithinScreen(page.getByRole('listbox'));
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the dialog that changes the terms fits the screen', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-prod');
    await lifecycle.openTerms('Initech Production');
    await settle(page);

    await expectWithinScreen(lifecycle.dialog());
    await expectWithinScreen(lifecycle.daysField());
    await lifecycle.saveTermsButton().scrollIntoViewIfNeeded();
    await expectWithinScreen(lifecycle.saveTermsButton());
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the dialog that subscribes with a trial fits the screen', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('initech-fresh');
    await billing.openSubscribe();
    await settle(page);

    await expectWithinScreen(billing.dialog());
    await expectWithinScreen(billing.trialDaysField());
    await expectNoHorizontalScroll(page, WIDTH);
  });
});

test.describe('the public listing of the licenses, on the narrowest phone', () => {
  test('the switch of a family stays on the screen beside its name', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installLicenseAppMocks(page, createLifecycleLicensesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await licenses.goto();

    await expect(licenses.publicSwitch('Enterprise')).toBeVisible();
    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(licenses.publicSwitch('Enterprise'));
    await expectWithinScreen(licenses.publicSwitch('Pro'));
  });
});
