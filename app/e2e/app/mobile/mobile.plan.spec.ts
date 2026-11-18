import { devices } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectNoHorizontalScroll,
  expectOnScreen,
} from '../_support/assertions/layout';
import { PlanPageDriver } from '../_support/drivers/plan.driver';
import { installPlanAppMocks } from '../_support/mocks/install-plan-app-mocks';
import { createPlanModel } from '../plan/plan.scenarios';

// The Plan & usage page on the narrowest phone the billing screens are checked at: the
// SDK's portal, its usage, its plans and its checkout keep the width of the screen, with
// what is due and the button that subscribes within reach.

const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

test.beforeEach(async ({ page }) => {
  await installPlanAppMocks(page, createPlanModel());
});

test.describe('the Plan & usage page, on the narrowest phone', () => {
  test('keeps the width of the screen, the portal and the plans included', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await plan.goto();
    await expect(plan.invoices()).toHaveCount(3);
    await expect(plan.usageRow('Webhook events')).toBeVisible();
    await expect(plan.plans()).toContainText('Cloud Growth');
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectOnScreen(page, plan.currentPlanPrice());
    // The usage block keeps the width of the screen, down to the row with the longest
    // line: a month's window, from one instant to the next.
    await expectOnScreen(page, plan.usage());
    await expectOnScreen(page, plan.usageRow('Webhook events'));
  });

  test('keeps it on the checkout, with what is due and Subscribe within reach', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await plan.goto('?plan=kaiten-growth-v1');
    await expect(plan.dueToday()).toHaveText('$79.00');
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectOnScreen(page, plan.dueToday());
    await expectOnScreen(
      page,
      plan.checkout().getByRole('button', { name: 'Subscribe' }),
    );
  });
});
