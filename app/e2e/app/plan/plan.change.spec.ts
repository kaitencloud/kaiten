import { expect, recordWrites, test } from '../_support/app-test';
import { PlanPageDriver } from '../_support/drivers/plan.driver';
import {
  GROWTH_ANNUAL,
  GROWTH_MONTHLY,
} from '../_support/fixtures/build-kaiten-cloud-plan';
import { installPlanAppMocks } from '../_support/mocks/install-plan-app-mocks';
import { createGrowthPlanModel, createPlanModel } from './plan.scenarios';

// The move to another plan: the plans Kaiten Cloud sells, but the one the organization is
// on; the one chosen goes in the address (`?plan=`), so that a return from the payment
// provider lands on its checkout; the checkout shows what Kaiten Cloud says is due today
// before anything is confirmed, and subscribing moves the organization to the plan.

const CHECKOUT_PATH = /^\/api\/public\/session\/checkout$/;

test.describe('changing the plan of the organization', () => {
  test('lists the plans it can move to, and not the one it is on', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();

    await expect(plan.change()).toContainText(
      'Move to another Kaiten Cloud plan. You see what is due before you confirm.',
    );
    await expect(plan.plans()).toContainText('Cloud Growth');
    await expect(plan.plans()).toContainText('$79.00');
    await expect(plan.plans()).not.toContainText('Cloud Starter');

    await plan.plans().getByRole('radio', { name: 'Annual' }).click();

    await expect(plan.plans()).toContainText('$790.00');
  });

  test('puts the plan chosen in the address and opens its checkout, priced by Kaiten Cloud', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    const checkouts = recordWrites(page, CHECKOUT_PATH);
    await plan.goto();

    await plan.selectPlan();

    await expect(page).toHaveURL(/\/settings\/plan\?plan=kaiten-growth-v1$/);
    await expect(plan.checkout()).toContainText('Cloud Growth');
    await expect(plan.dueToday()).toHaveText('$79.00');
    expect(checkouts[0]?.body).toEqual({
      dryRun: true,
      licensePriceId: GROWTH_MONTHLY.id,
    });

    await plan.checkout().getByRole('radio', { name: '$790.00/year' }).click();

    await expect(plan.dueToday()).toHaveText('$790.00');
    expect(checkouts.at(-1)?.body).toEqual({
      dryRun: true,
      licensePriceId: GROWTH_ANNUAL.id,
    });
  });

  test('opens the checkout from the address alone, as a return from the payment provider does', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());

    await plan.goto('?plan=kaiten-growth-v1');

    await expect(plan.dueToday()).toHaveText('$79.00');
    await expect(plan.plans()).toHaveCount(0);
  });

  test('goes back to the plans on Cancel, and the address forgets the plan', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto('?plan=kaiten-growth-v1');
    await expect(plan.dueToday()).toHaveText('$79.00');

    await plan.checkout().getByRole('button', { name: 'Cancel' }).click();

    await expect(page).toHaveURL(/\/settings\/plan$/);
    await expect(plan.checkout()).toHaveCount(0);
    await expect(plan.plans()).toContainText('Cloud Growth');
  });

  test('shows the plans for a plan the catalogue does not sell', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());

    await plan.goto('?plan=kaiten-scale-v1');

    await expect(plan.plans()).toContainText('Cloud Growth');
    await expect(plan.checkout()).toHaveCount(0);
  });

  test('moves the organization to the plan on Subscribe, charges its card and offers the others', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    const checkouts = recordWrites(page, CHECKOUT_PATH);
    await plan.goto('?plan=kaiten-growth-v1');
    await expect(plan.dueToday()).toHaveText('$79.00');

    await plan.checkout().getByRole('button', { name: 'Subscribe' }).click();

    await expect(page).toHaveURL(/\/settings\/plan$/);
    await expect(plan.currentPlanPrice()).toHaveText('$79.00/month');
    await expect(plan.invoices()).toHaveCount(4);
    await expect(plan.invoices().first()).toContainText('$79.00');
    // The usage reads the portal the subscribe changed: what is used, on Growth's limits.
    await expect(
      plan.usage().getByRole('heading', { level: 2, name: 'Cloud Growth' }),
    ).toBeVisible();
    await expect(plan.usageRow('Managed customers')).toContainText('9 / 250');
    await expect(plan.usageRow('Instances')).toContainText('14 / Unlimited');
    await expect(plan.plans()).toContainText('Cloud Starter');
    await expect(plan.plans()).not.toContainText('Cloud Growth');
    expect(checkouts.at(-1)?.body).toEqual({
      licensePriceId: GROWTH_MONTHLY.id,
      returnUrl: new URL(
        '/settings/plan?plan=kaiten-growth-v1',
        page.url(),
      ).toString(),
    });

    // The mocks keep the subscription: Kaiten Cloud still says so after a reload.
    await page.reload();
    await expect(plan.currentPlanPrice()).toHaveText('$79.00/month');
  });

  test('says the change is not the organization’s to make over a paid plan, as Kaiten Cloud refuses it', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createGrowthPlanModel());
    await plan.goto();
    await expect(plan.currentPlanPrice()).toHaveText('$79.00/month');

    await plan.selectPlan();

    await expect(page).toHaveURL(/\/settings\/plan\?plan=kaiten-starter-v1$/);
    await expect(plan.checkout()).toContainText(
      'You already have a subscription.',
    );
    await expect(
      plan.checkout().getByRole('button', { name: 'Subscribe' }),
    ).toHaveCount(0);
  });
});
