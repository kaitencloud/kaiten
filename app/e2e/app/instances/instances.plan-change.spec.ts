import { expect, expectToast, test } from '../_support/app-test';
import { recordGraphQL, recordWrites } from '../_support/assertions/requests';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
} from '../billing/lifecycle-world';

// Moving a subscription to another plan is a route of its own over the Billing tab:
// the plan it takes effect with, at the end of the current period and never before,
// with nothing prorated. The plans are the active flat fees of the license versions
// on sale; the console says what the change does and never draws the invoice of it,
// which the API cannot compose for a change that is not scheduled yet.

const SCHEDULED_CHANGE = /\/api\/instances\/[^/]+\/billing\/scheduled-change$/;

test.describe('changing the plan of a subscription', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('says the plan it is on, when the change would take effect and that nothing is prorated', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');

    await lifecycle.openPlanChange('Initech Production');

    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing\/plan-change$/,
    );
    const timeline = lifecycle.planTimeline();
    await expect(timeline).toContainText(
      'Current plan: Pro v2, monthly · $29.00/month',
    );
    await expect(timeline).toContainText(
      'The change takes effect on Oct 15, 2026 (UTC)',
    );
    await expect(timeline).toContainText('Nothing is prorated');
  });

  test('shows the invoice as things stand and says it is not the invoice of the change', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');

    await lifecycle.openPlanChange('Initech Production');

    await expect(lifecycle.planTimeline()).toContainText(
      'Without the change, the next invoice would be a renewal invoice of',
    );
    await expect(lifecycle.planTimeline()).toContainText(
      'Kaiten cannot compose the invoice of a change that is not scheduled yet',
    );
  });

  test('offers the active flat fees of the versions on sale, the plan it is on left out, and reads every version and its prices in one request', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const graphql = recordGraphQL(page);
    const reads = recordWrites(page, /\/api\/licenses\/[^/]+\/prices$/, [
      'GET',
    ]);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openPlanChange('Initech Production');

    await lifecycle.openPlanOptions();

    // By name, the newest version first. Not the version that is a draft, the
    // version whose only price is retired, nor the plan the subscription is on.
    await expect(page.getByRole('option')).toHaveText([
      'Enterprise v1 · Enterprise v1, monthly · €99.00/month · In advance — Different currency (EUR)',
      'Pro v3 · Pro v3, monthly · $39.00/month · In advance',
      'Pro v2 · Pro v2, annual · $290.00/year · In arrears',
    ]);
    // One document for the versions and the active prices of each, and not one read
    // of the prices per version: five versions, a draft and a retired price among them.
    expect(
      graphql.filter(
        ({ operationName }) => operationName === 'GetLicensesWithPrices',
      ),
    ).toEqual([
      { operationName: 'GetLicensesWithPrices', variables: { limit: 200 } },
    ]);
    expect(reads).toEqual([]);
  });

  test('lists a plan in another currency and refuses it, saying why', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openPlanChange('Initech Production');
    await lifecycle.openPlanOptions();

    const other = page.getByRole('option', { name: /Enterprise v1/ });
    await expect(other).toHaveAttribute('aria-disabled', 'true');
    await expect(other).toContainText('Different currency (EUR)');
    await other.click({ force: true });

    await expect(lifecycle.schedulePlanButton()).toBeDisabled();
  });

  test('schedules the plan chosen, with the price alone, and the tab says it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, SCHEDULED_CHANGE);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openPlanChange('Initech Production');
    await expect(lifecycle.schedulePlanButton()).toBeDisabled();

    await lifecycle.choosePlan(/Pro v3/);
    await lifecycle.schedulePlanButton().click();

    await expectToast(page, 'The plan change is scheduled');
    expect(writes).toEqual([
      {
        body: { licensePriceId: 'price-pro-v3-monthly' },
        method: 'PUT',
        pathname: '/api/instances/initech-prod/billing/scheduled-change',
      },
    ]);
    // Closed, back on the tab, which says it and offers to drop it.
    await expect(lifecycle.dialog()).toHaveCount(0);
    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing$/,
    );
    await expect(lifecycle.scheduledChangeNotice()).toContainText(
      'Changes to Pro v3 ($39.00/month) on Oct 15, 2026 (UTC)',
    );
    await expect(lifecycle.dropChangeButton()).toBeVisible();
  });

  test('sends one request however often it is pressed', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, SCHEDULED_CHANGE);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openPlanChange('Initech Production');
    await lifecycle.choosePlan(/Pro v3/);

    await lifecycle.schedulePlanButton().dblclick();

    await expectToast(page, 'The plan change is scheduled');
    expect(writes).toHaveLength(1);
  });

  test('says a change already scheduled first, with the way to drop it, and replaces it when another plan is chosen', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, SCHEDULED_CHANGE);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-moving');
    await lifecycle.openPlanChange('Initech Moving');

    await expect(lifecycle.scheduledSummary()).toContainText(
      'A change to Pro v3 ($39.00/month) is already scheduled for Oct 15, 2026 (UTC).',
    );
    await expect(lifecycle.scheduledSummary()).toContainText(
      'Choosing another plan replaces it.',
    );
    // The invoice of the boundary already applies it, and says so.
    await expect(lifecycle.planTimeline()).toContainText(
      'The next invoice already applies the scheduled change',
    );
    await lifecycle.choosePlan(/Pro v2 · Pro v2, annual/);
    await lifecycle.schedulePlanButton().click();

    await expectToast(page, 'The plan change is scheduled');
    expect(writes).toEqual([
      {
        body: { licensePriceId: 'price-pro-v2-annual' },
        method: 'PUT',
        pathname: '/api/instances/initech-moving/billing/scheduled-change',
      },
    ]);
    await expect(lifecycle.scheduledChangeNotice()).toContainText(
      'Changes to Pro v2 ($290.00/year) on Oct 15, 2026 (UTC)',
    );
  });

  test('drops the change scheduled from the dialog that schedules one', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, SCHEDULED_CHANGE);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-moving');
    await lifecycle.openPlanChange('Initech Moving');

    await lifecycle
      .scheduledSummary()
      .getByRole('button', { name: 'Cancel the change' })
      .click();

    await expectToast(page, 'The plan change was canceled');
    await expect(lifecycle.scheduledSummary()).toHaveCount(0);
    expect(writes.map((write) => write.method)).toEqual(['DELETE']);
  });

  test('puts the refusal of the plan on the plan, in the words of the API, and keeps the dialog and the choice', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('schedulePlanChange', {
      code: 'SchedulePlanChange.PriceDeprecated',
      detail: 'the price was taken off sale since it was listed',
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openPlanChange('Initech Production');
    await lifecycle.choosePlan(/Pro v3/);

    await lifecycle.schedulePlanButton().click();

    await expect(lifecycle.dialog()).toContainText(
      'the price was taken off sale since it was listed',
    );
    await expect(lifecycle.alert()).toHaveCount(0);
    await expect(lifecycle.planField()).toContainText('Pro v3');
    await expect(page).toHaveURL(/\/billing\/plan-change$/);
  });

  test('says above the buttons a refusal that is about the subscription and not the plan', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('schedulePlanChange', {
      code: 'SchedulePlanChange.CancellationScheduled',
      detail: 'a cancellation is scheduled: reactivate the subscription first',
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openPlanChange('Initech Production');
    await lifecycle.choosePlan(/Pro v3/);

    await lifecycle.schedulePlanButton().click();

    await expect(lifecycle.alert()).toContainText(
      'a cancellation is scheduled: reactivate the subscription first',
    );
  });

  test('says a period being closed is being closed, and sends the same request again by itself', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, SCHEDULED_CHANGE);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('schedulePlanChange', {
      code: 'SchedulePlanChange.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      retryAfterSeconds: 1,
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openPlanChange('Initech Production');
    await lifecycle.choosePlan(/Pro v3/);

    await lifecycle.schedulePlanButton().click();

    await expect(lifecycle.closing()).toContainText('Closing the period');
    await expectToast(page, 'The plan change is scheduled');
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
  });

  test.describe('when the plan cannot change', () => {
    test('says why for a trial, and reads no plan', async ({ page }) => {
      const lifecycle = new InstanceLifecycleDriver(page);
      const graphql = recordGraphQL(page);
      const reads = recordWrites(page, /\/api\/licenses\/[^/]+\/prices$/, [
        'GET',
      ]);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await page.goto('/customers/instances/initech-trial/billing/plan-change');

      await expect(lifecycle.planUnavailable()).toContainText(
        'A plan cannot change during a trial.',
      );
      await expect(lifecycle.schedulePlanButton()).toHaveCount(0);
      expect(reads).toEqual([]);
      expect(
        graphql.filter(
          ({ operationName }) => operationName === 'GetLicensesWithPrices',
        ),
      ).toEqual([]);
    });

    test('says to reactivate first for a cancellation that is scheduled', async ({
      page,
    }) => {
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await page.goto(
        '/customers/instances/initech-leaving/billing/plan-change',
      );

      await expect(lifecycle.planUnavailable()).toContainText(
        'Reactivate the subscription first to change its plan.',
      );
    });

    test('says a subscription that ended has no plan to change', async ({
      page,
    }) => {
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await page.goto('/customers/instances/hooli-prod/billing/plan-change');

      await expect(lifecycle.planUnavailable()).toContainText(
        'This subscription has ended: subscribe the instance again to choose a plan.',
      );
    });

    test('says an instance nobody bills has none', async ({ page }) => {
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await page.goto('/customers/instances/initech-fresh/billing/plan-change');

      await expect(lifecycle.planUnavailable()).toContainText(
        'This instance has no subscription.',
      );
    });
  });
});
