import type { Page } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import {
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { PlanPageDriver } from '../_support/drivers/plan.driver';
import { installPlanAppMocks } from '../_support/mocks/install-plan-app-mocks';
import {
  createPlanModel,
  createPlanSessionRefusedModel,
} from '../plan/plan.scenarios';

// The Plan & usage page as a person who cannot use a mouse or a screen meets it: no
// violation on the portal, its usage and the plans, on the checkout of the plan chosen,
// or on the card of a refused session, in either theme. Most of it is drawn by Kaiten's
// React SDK, inside the console's page.

async function expectAccessibleInBothThemes(page: Page) {
  await settle(page);
  await expectNoAccessibilityViolations(page);

  await useLightTheme(page);
  await expectNoAccessibilityViolations(page);
}

test.describe('accessibility of the Plan & usage page', () => {
  test('the portal and the plans have no WCAG A/AA violations in either theme', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();
    await expect(plan.invoices()).toHaveCount(3);
    await expect(plan.usageRow('Webhook events')).toBeVisible();
    await expect(plan.plans()).toContainText('Cloud Growth');

    await expectAccessibleInBothThemes(page);
  });

  test('the checkout has none either, and names its choices', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto('?plan=kaiten-growth-v1');
    await expect(plan.dueToday()).toHaveText('$79.00');

    await expect(
      plan.checkout().getByRole('radiogroup', { name: 'Billing interval' }),
    ).toBeVisible();
    await expect(
      plan.checkout().getByRole('textbox', { name: 'Voucher code' }),
    ).toBeVisible();
    await expectAccessibleInBothThemes(page);
  });

  test('the card of a refused session has none, and its retry is a named button', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(
      page,
      createPlanSessionRefusedModel('notProvisioned'),
    );
    await plan.goto();

    await expect(
      plan.problem().getByRole('button', { name: 'Try again' }),
    ).toBeVisible();
    await expectAccessibleInBothThemes(page);
  });
});
