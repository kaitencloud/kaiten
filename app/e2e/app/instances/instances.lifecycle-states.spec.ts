import { expect, expectToast, test } from '../_support/app-test';
import { recordGraphQL, recordWrites } from '../_support/assertions/requests';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { billingCapabilities } from '../_support/model/billing-capabilities';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  INITECH_LATE_INVOICE_ID,
} from '../billing/lifecycle-world';

// What the Billing tab says of a subscription that is going through something, and
// what may be done to it: a trial, an invoice that is overdue, a cancellation or a
// plan change that waits for the boundary, and an ended subscription. Each state is a
// sentence of its own and says what is still true; none is left to the color of a badge.

const BILLING_WRITES = /\/api\/instances\/[^/]+\/billing\/[^/]+$/;

test.describe('the Billing tab of a subscription going through something', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('says nothing above the card of a subscription that just runs, and offers what may be done to it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await billing.goto('initech-prod');

    await expect(lifecycle.actions()).toBeVisible();
    await expect(lifecycle.notices()).toHaveCount(0);
    await expect(lifecycle.changePlanLink()).toHaveAttribute(
      'href',
      '/customers/instances/initech-prod/billing/plan-change',
    );
    await expect(lifecycle.termsLink()).toHaveAttribute(
      'href',
      '/customers/instances/initech-prod/billing/terms',
    );
    await expect(lifecycle.cancelLink()).toHaveAttribute(
      'href',
      '/customers/instances/initech-prod/billing/cancel',
    );
  });

  test.describe('a trial', () => {
    test('says when it ends, how long is left, that nothing is billed, and when the first invoice is issued', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-trial');

      const notice = lifecycle.trialNotice();
      await expect(notice).toContainText('Trial until Oct 13, 2026 (UTC)');
      await expect(notice).toContainText('6 days left');
      await expect(notice).toContainText(
        'Nothing is billed during the trial, and its usage is never billed.',
      );
      await expect(notice).toContainText(
        'The first invoice is issued on Oct 13, 2026 (UTC).',
      );
    });

    test('puts the trial on the card where the next boundary would be', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-trial');

      const card = billing.subscriptionCard();
      await expect(card).toContainText('Trial');
      await expect(billing.row(card, 'Trial ends')).toContainText(
        'Oct 13, 2026 (UTC)',
      );
      await expect(billing.row(card, 'First invoice')).toContainText(
        'Oct 13, 2026 (UTC)',
      );
      await expect(
        card.getByText('Next boundary', { exact: true }),
      ).toHaveCount(0);
    });

    test('greys the plan change out, on a button the keyboard still reaches, and says why', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());
      await billing.goto('initech-trial');

      await expect(lifecycle.changePlanButton()).toBeDisabled();
      await expect(lifecycle.changePlanLink()).toHaveCount(0);
      await lifecycle.changePlanButton().locator('xpath=..').hover();

      await expect(page.getByText('Unavailable during a trial')).toBeVisible();
      // The terms and the cancellation stay.
      await expect(lifecycle.termsLink()).toBeVisible();
      await expect(lifecycle.cancelLink()).toBeVisible();
    });
  });

  test.describe('a subscription past due', () => {
    test('says since when and for how long, names the invoice that is overdue, and leads to it', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-late');

      const notice = lifecycle.pastDueNotice();
      await expect(notice).toContainText(
        'Past due since Sep 1, 2026 (UTC) (36 days)',
      );
      await expect(notice).toContainText(
        'has been unpaid since it fell due on Sep 1, 2026 (UTC).',
      );
      await notice.getByRole('link', { name: 'View the invoice' }).click();

      await expect(page).toHaveURL(
        new RegExp(`/invoices/${INITECH_LATE_INVOICE_ID}$`),
      );
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'Activation invoice',
      );
    });

    test('says access is unchanged, and counts down to nothing', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-late');

      const notice = lifecycle.pastDueNotice();
      await expect(notice).toContainText(
        'Access is unchanged: Kaiten does not restrict a customer with an unpaid invoice in this version.',
      );
      await expect(notice).not.toContainText(/remaining|suspend|left/i);
      await expect(
        billing.row(billing.subscriptionCard(), 'Past due since'),
      ).toContainText('Sep 1, 2026 (UTC)');
    });

    test('still offers the terms, the cancellation and the plan', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-late');

      await expect(lifecycle.changePlanLink()).toBeVisible();
      await expect(lifecycle.termsLink()).toBeVisible();
      await expect(lifecycle.cancelLink()).toBeVisible();
    });
  });

  test.describe('a cancellation scheduled for the end of the period', () => {
    test('says when the subscription ends, why, and what is still true', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-leaving');

      const notice = lifecycle.cancellationNotice();
      await expect(notice).toContainText('Cancels on Oct 15, 2026 (UTC)');
      await expect(notice).toContainText(
        'The period is paid for, so nothing changes until then.',
      );
      await expect(notice).toContainText('Reason: Moving in-house');
      const card = billing.subscriptionCard();
      await expect(billing.row(card, 'Ends on')).toContainText(
        'Oct 15, 2026 (UTC)',
      );
      await expect(
        card.getByText('Next boundary', { exact: true }),
      ).toHaveCount(0);
    });

    test('greys the plan change out, saying to reactivate first', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());
      await billing.goto('initech-leaving');

      await expect(lifecycle.changePlanButton()).toBeDisabled();
      await lifecycle.changePlanButton().locator('xpath=..').hover();

      await expect(
        page.getByText('Reactivate the subscription first'),
      ).toBeVisible();
    });

    test('takes the cancellation back with one click, and the tab follows', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const writes = recordWrites(page, BILLING_WRITES);
      await installBillingAppMocks(page, createLifecycleBillingModel());
      await billing.goto('initech-leaving');

      await lifecycle.reactivateButton().click();

      await expectToast(page, 'The cancellation was taken back');
      await expect(lifecycle.cancellationNotice()).toHaveCount(0);
      expect(writes).toEqual([
        {
          body: null,
          method: 'POST',
          pathname: '/api/instances/initech-leaving/billing/reactivate',
        },
      ]);
      // The plan can change again, and the boundary is a boundary again.
      await expect(lifecycle.changePlanLink()).toBeVisible();
      await expect(
        billing.row(billing.subscriptionCard(), 'Next boundary'),
      ).toContainText('Oct 15, 2026 (UTC)');
    });

    test('sends one request however often it is pressed', async ({ page }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const writes = recordWrites(page, BILLING_WRITES);
      await installBillingAppMocks(page, createLifecycleBillingModel());
      await billing.goto('initech-leaving');

      await lifecycle.reactivateButton().dblclick();

      await expectToast(page, 'The cancellation was taken back');
      expect(writes).toHaveLength(1);
    });

    test('tells in a toast, in the words of the API, that there is nothing to take back', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const model = createLifecycleBillingModel();
      model.subscriptions.armProblem('reactivateSubscription', {
        code: 'ReactivateSubscription.NotScheduledForCancellation',
        detail: 'the subscription is not scheduled for cancellation',
        status: 409,
      });
      await installBillingAppMocks(page, model);
      await billing.goto('initech-leaving');

      await lifecycle.reactivateButton().click();

      await expectToast(
        page,
        'the subscription is not scheduled for cancellation',
      );
    });

    test('tells in a toast that it ended meanwhile, and leads to the dialog that subscribes it again', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const model = createLifecycleBillingModel();
      model.subscriptions.armProblem('reactivateSubscription', {
        code: 'ReactivateSubscription.Canceled',
        detail: 'the subscription is already canceled',
        status: 409,
      });
      await installBillingAppMocks(page, model);
      await billing.goto('initech-leaving');

      await lifecycle.reactivateButton().click();

      await expectToast(page, 'the subscription is already canceled');
      await page
        .locator('[data-sonner-toast]')
        .getByRole('button', { name: 'Subscribe again' })
        .click();

      await expect(page).toHaveURL(
        /\/customers\/instances\/initech-leaving\/billing\/subscribe$/,
      );
      await expect(lifecycle.dialog()).toBeVisible();
    });

    test('says a period being closed is being closed, and sends the request again by itself', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const writes = recordWrites(page, BILLING_WRITES);
      const model = createLifecycleBillingModel();
      model.subscriptions.armProblem('reactivateSubscription', {
        code: 'ReactivateSubscription.BoundaryPending',
        detail: 'the period has ended and is being closed; retry in a minute',
        retryAfterSeconds: 1,
        status: 409,
      });
      await installBillingAppMocks(page, model);
      await billing.goto('initech-leaving');

      await lifecycle.reactivateButton().click();

      await expect(lifecycle.closing()).toContainText('Closing the period');
      await expectToast(page, 'The cancellation was taken back');
      expect(writes).toHaveLength(2);
    });

    test('shows any other refusal in the notice, with a way to press the button again', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const model = createLifecycleBillingModel();
      model.subscriptions.armProblem('reactivateSubscription', {
        code: 'ReactivateSubscription.ProviderUnavailable',
        detail: 'the billing provider is unavailable',
        status: 503,
      });
      await installBillingAppMocks(page, model);
      await billing.goto('initech-leaving');

      await lifecycle.reactivateButton().click();

      const alert = lifecycle.cancellationNotice().getByRole('alert');
      await expect(alert).toContainText('the billing provider is unavailable');
      await alert.getByRole('button', { name: 'Retry' }).click();

      await expectToast(page, 'The cancellation was taken back');
    });
  });

  test.describe('a plan change waiting for the boundary', () => {
    test('says to which plan, for how much and when, and that nothing is prorated', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-moving');

      const notice = lifecycle.scheduledChangeNotice();
      // The license version the price belongs to is found among the versions on sale.
      await expect(notice).toContainText(
        'Changes to Pro v3 ($39.00/month) on Oct 15, 2026 (UTC)',
      );
      await expect(notice).toContainText('Nothing is prorated');
    });

    test('finds that version in the one document of the licenses, and reads the prices of no version apart', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const graphql = recordGraphQL(page);
      const reads = recordWrites(page, /\/api\/licenses\/[^/]+\/prices$/, [
        'GET',
      ]);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-moving');
      await expect(lifecycle.scheduledChangeNotice()).toContainText(
        'Changes to Pro v3 ($39.00/month)',
      );

      expect(
        graphql.filter(
          ({ operationName }) => operationName === 'GetLicensesWithPrices',
        ),
      ).toEqual([
        { operationName: 'GetLicensesWithPrices', variables: { limit: 200 } },
      ]);
      expect(reads).toEqual([]);
    });

    test('names the price alone, and asks for nothing, to a session that may not read licenses', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const graphql = recordGraphQL(page);
      await signInWithScopes(page, ['read:billing', 'read:instances']);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-moving');

      await expect(lifecycle.scheduledChangeNotice()).toContainText(
        'Changes to Pro v3, monthly ($39.00/month)',
      );
      expect(
        graphql.filter(
          ({ operationName }) => operationName === 'GetLicensesWithPrices',
        ),
      ).toEqual([]);
    });

    test('drops the change with one click, and the notice goes with it', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      const writes = recordWrites(
        page,
        /\/api\/instances\/[^/]+\/billing\/scheduled-change$/,
      );
      await installBillingAppMocks(page, createLifecycleBillingModel());
      await billing.goto('initech-moving');

      await lifecycle.dropChangeButton().click();

      await expectToast(page, 'The plan change was canceled');
      await expect(lifecycle.scheduledChangeNotice()).toHaveCount(0);
      expect(writes).toEqual([
        {
          body: null,
          method: 'DELETE',
          pathname: '/api/instances/initech-moving/billing/scheduled-change',
        },
      ]);
    });
  });

  test.describe('a subscription that ended', () => {
    test('has no notice and nothing to do to it: it is subscribed again instead', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('hooli-prod');

      const card = billing.subscriptionCard();
      await expect(card).toContainText('Canceled');
      await expect(billing.row(card, 'Canceled on')).toContainText(
        'Sep 20, 2026 (UTC)',
      );
      await expect(billing.row(card, 'Reason')).toContainText('Budget');
      await expect(lifecycle.notices()).toHaveCount(0);
      await expect(lifecycle.actions()).toHaveCount(0);
      await expect(lifecycle.reactivateButton()).toHaveCount(0);
      await expect(billing.subscribeLink()).toBeVisible();
    });
  });

  test.describe('who may do what', () => {
    test('offers a session that only reads the notices and none of what may be done', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await signInWithScopes(page, SESSION_SCOPES.reader);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-leaving');

      await expect(lifecycle.cancellationNotice()).toContainText(
        'Cancels on Oct 15, 2026 (UTC)',
      );
      await expect(lifecycle.reactivateButton()).toHaveCount(0);
      await expect(lifecycle.actions()).toHaveCount(0);
    });

    test('offers a session that may write billing what may be done', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await signInWithScopes(page, SESSION_SCOPES.sales);
      await installBillingAppMocks(page, createLifecycleBillingModel());

      await billing.goto('initech-leaving');

      await expect(lifecycle.reactivateButton()).toBeVisible();
      await expect(lifecycle.cancelLink()).toBeVisible();
    });

    test('offers none of it where the release does not ship the lifecycle, and still says the state', async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const lifecycle = new InstanceLifecycleDriver(page);
      await installBillingAppMocks(
        page,
        createLifecycleBillingModel(billingCapabilities()),
      );

      await billing.goto('initech-leaving');

      await expect(lifecycle.cancellationNotice()).toContainText(
        'Cancels on Oct 15, 2026 (UTC)',
      );
      await expect(lifecycle.reactivateButton()).toHaveCount(0);
      await expect(lifecycle.actions()).toHaveCount(0);
    });
  });
});
