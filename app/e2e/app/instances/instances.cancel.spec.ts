import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { BILLED_NOW } from '../billing/billed-instances';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
} from '../billing/lifecycle-world';

// Cancelling a subscription is a route of its own over the Billing tab: when it
// ends (at the end of the period, which is paid for, or now), why, and two things a
// cancellation does not do by itself and offers to do beside it. It says what each
// choice does before it is confirmed, and what it did once it was accepted.

const WRITES = /\/api\/instances\/[^/]+(\/billing\/cancel|\/addons\/[^/]+)?$/;

test.describe('cancelling a subscription', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('waits for the end of the period by default, says what that does, and says it is scheduled once accepted', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');

    await lifecycle.openCancel('Initech Production');

    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing\/cancel$/,
    );
    await expect(lifecycle.cancelModeField()).toContainText(
      'At the end of the period: Oct 15, 2026 (UTC)',
    );
    await expect(lifecycle.cancelExplanation()).toContainText(
      'The subscription ends on Oct 15, 2026 (UTC)',
    );
    await expect(lifecycle.cancelExplanation()).toContainText(
      'You can reactivate the subscription from the Billing tab until then.',
    );
    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.canceled()).toContainText('Cancellation scheduled');
    await expect(lifecycle.canceled()).toContainText(
      'The subscription ends on Oct 15, 2026 (UTC).',
    );
    // The mode alone: no reason was given, and nothing else goes with it.
    expect(writes).toEqual([
      {
        body: { mode: 'AT_PERIOD_END' },
        method: 'POST',
        pathname: '/api/instances/initech-prod/billing/cancel',
      },
    ]);

    // The tab behind it already says so; closing the dialog leads back to it.
    await lifecycle.close();
    await expect(page).toHaveURL(
      /\/customers\/instances\/initech-prod\/billing$/,
    );
    await expect(lifecycle.cancellationNotice()).toContainText(
      'Cancels on Oct 15, 2026 (UTC)',
    );
    await expect(lifecycle.reactivateButton()).toBeVisible();
  });

  test('keeps the reason as it was typed, trimmed, and shows it on the card and in the notice', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');

    await lifecycle.reasonField().fill('  Moving to another vendor  ');
    await lifecycle.cancelConfirmButton().click();
    await expect(lifecycle.canceled()).toBeVisible();

    expect(writes[0].body).toEqual({
      mode: 'AT_PERIOD_END',
      reason: 'Moving to another vendor',
    });
    await lifecycle.close();
    await expect(lifecycle.cancellationNotice()).toContainText(
      'Reason: Moving to another vendor',
    );
  });

  test('counts the characters of the reason, accepts 500 and refuses 501 before the API does', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');

    await expect(lifecycle.dialog()).toContainText('0/500 characters');
    await lifecycle.reasonField().fill('é'.repeat(500));
    await expect(lifecycle.dialog()).toContainText('500/500 characters');
    await expect(lifecycle.cancelConfirmButton()).toBeEnabled();

    await lifecycle.reasonField().fill('é'.repeat(501));
    await lifecycle.reasonField().blur();

    await expect(lifecycle.dialog()).toContainText(
      'The reason is at most 500 characters',
    );
    await expect(lifecycle.dialog()).toContainText('501/500 characters');
    await expect(lifecycle.cancelConfirmButton()).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('ends it now when asked to: it says it cannot be undone, issues the final invoice and leads to it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');

    await lifecycle.chooseCancelMode('Immediately');

    await expect(lifecycle.cancelExplanation()).toContainText(
      'The subscription ends now',
    );
    await expect(lifecycle.cancelExplanation()).toContainText('No proration');
    await expect(lifecycle.cancelExplanation()).toContainText(
      'is not refunded',
    );
    await expect(lifecycle.cancelExplanation()).toContainText(
      'This cannot be undone',
    );
    await lifecycle.reasonField().fill('Contract ended');
    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.canceled()).toContainText('Subscription canceled');
    await expect(lifecycle.canceled()).toContainText('Final invoice:');
    expect(writes).toEqual([
      {
        body: { mode: 'IMMEDIATE', reason: 'Contract ended' },
        method: 'POST',
        pathname: '/api/instances/initech-prod/billing/cancel',
      },
    ]);

    await lifecycle
      .canceled()
      .getByRole('link', { name: 'View the invoice' })
      .click();

    await expect(page).toHaveURL(/\/invoices\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Final invoice',
    );
  });

  test('leaves the tab as an ended subscription: canceled, with its reason, and nothing more to do to it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');
    await lifecycle.chooseCancelMode('Immediately');
    await lifecycle.reasonField().fill('Contract ended');
    await lifecycle.cancelConfirmButton().click();
    await expect(lifecycle.canceled()).toBeVisible();

    await lifecycle.close();

    const card = billing.subscriptionCard();
    await expect(card).toContainText('Canceled');
    await expect(billing.row(card, 'Reason')).toContainText('Contract ended');
    await expect(lifecycle.notices()).toHaveCount(0);
    await expect(lifecycle.actions()).toHaveCount(0);
    await expect(billing.subscribeLink()).toBeVisible();
    await expect(billing.upcomingCard()).toHaveCount(0);
    // The final invoice is among the invoices of the instance.
    await expect(billing.invoiceRows()).toHaveCount(1);
    await expect(billing.invoiceRows().first()).toContainText('Final');
  });

  test('ends a trial at once: no choice of when, nothing billed, and no invoice', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-trial');
    await lifecycle.openCancel('Initech Trial');

    await expect(lifecycle.cancelModeField()).toHaveCount(0);
    await expect(lifecycle.cancelExplanation()).toContainText(
      'The trial ends now',
    );
    await expect(lifecycle.cancelExplanation()).toContainText(
      'Nothing is billed',
    );
    await page.getByRole('button', { name: 'End the trial' }).click();

    await expect(lifecycle.canceled()).toContainText('Trial ended');
    await expect(lifecycle.canceled()).toContainText('Nothing was billed');
    await expect(lifecycle.canceled()).not.toContainText('Final invoice');
    expect(writes[0].body).toEqual({ mode: 'IMMEDIATE' });
    await lifecycle.close();
    await expect(billing.subscriptionCard()).toContainText('Canceled');
    await expect(billing.invoiceRows()).toHaveCount(0);
  });

  test('offers the add-ons and the end of the license beside the cancellation, unchecked, and does neither unless asked', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-seats');
    await lifecycle.openCancel('Initech Seats');

    await expect(lifecycle.removeAddonsCheckbox()).not.toBeChecked();
    await expect(lifecycle.setEndDateCheckbox()).not.toBeChecked();
    await expect(lifecycle.dialog()).toContainText('extra-seats-v1 × 2');
    await expect(lifecycle.dialog()).toContainText(
      'The license of this instance ends on Mar 1, 2027 (UTC).',
    );
    await expect(lifecycle.endDateField()).toHaveCount(0);
    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.canceled()).toBeVisible();
    await expect(lifecycle.followUps()).toHaveCount(0);
    // Cancelling changes billing only: one request, to billing.
    expect(writes.map((write) => `${write.method} ${write.pathname}`)).toEqual([
      'POST /api/instances/initech-seats/billing/cancel',
    ]);
  });

  test('removes the add-ons and ends the license once the cancellation is accepted, one request each, and says each was done', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-seats');
    await lifecycle.openCancel('Initech Seats');

    await lifecycle.removeAddonsCheckbox().check();
    await lifecycle.setEndDateCheckbox().check();
    // Proposed as the end of the period, since the cancellation waits for it.
    await expect(lifecycle.endDateField()).toHaveValue('2026-10-15T00:00');
    await lifecycle.endDateField().fill('2026-10-20T08:30');
    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.followUps()).toContainText(
      'Add-ons removed: extra-seats-v1.',
    );
    await expect(lifecycle.followUps()).toContainText(
      'The license now ends on Oct 20, 2026, 8:30 AM (UTC).',
    );
    expect(writes.map((write) => `${write.method} ${write.pathname}`)).toEqual([
      'POST /api/instances/initech-seats/billing/cancel',
      'DELETE /api/instances/initech-seats/addons/extra-seats-v1',
      'PUT /api/instances/initech-seats',
    ]);
    // The instance is sent back whole with the one date changed.
    expect(writes[2].body).toMatchObject({
      endLicenseDate: '2026-10-20T08:30:00.000Z',
      name: 'Initech Seats',
      startLicenseDate: '2026-03-01T00:00:00.000Z',
    });
  });

  test('keeps the cancellation when a follow-up fails, says which, and tries only that one again', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('detachInstanceAddon', {
      code: 'DetachInstanceAddon.Locked',
      detail: 'the subscription is being closed',
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-seats');
    await lifecycle.openCancel('Initech Seats');
    await lifecycle.removeAddonsCheckbox().check();

    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.canceled()).toContainText('Cancellation scheduled');
    await expect(lifecycle.followUps()).toContainText(
      'extra-seats-v1 could not be removed. the subscription is being closed',
    );
    await lifecycle
      .followUps()
      .getByRole('button', { name: 'Try again' })
      .click();

    await expect(lifecycle.followUps()).toContainText(
      'Add-ons removed: extra-seats-v1.',
    );
    await expect(
      lifecycle.followUps().getByRole('button', { name: 'Try again' }),
    ).toHaveCount(0);
    expect(writes.map((write) => `${write.method} ${write.pathname}`)).toEqual([
      'POST /api/instances/initech-seats/billing/cancel',
      'DELETE /api/instances/initech-seats/addons/extra-seats-v1',
      'DELETE /api/instances/initech-seats/addons/extra-seats-v1',
    ]);
  });

  test('says in the words of the API that it was canceled meanwhile, keeps the dialog open, and does not pretend', async ({
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
    await lifecycle.reasonField().fill('Budget');

    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.alert()).toContainText(
      'the subscription is already canceled',
    );
    await expect(lifecycle.canceled()).toHaveCount(0);
    await expect(lifecycle.reasonField()).toHaveValue('Budget');
  });

  test('puts the refusal of a reason on the reason field', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('cancelSubscription', {
      code: 'CancelSubscription.InvalidReason',
      detail: 'reason is at most 500 characters',
      status: 422,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');

    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.dialog()).toContainText(
      'reason is at most 500 characters',
    );
    await expect(lifecycle.alert()).toHaveCount(0);
  });

  test('says a period being closed is being closed, and sends the same request again by itself', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('cancelSubscription', {
      code: 'CancelSubscription.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      retryAfterSeconds: 1,
      status: 409,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');
    await lifecycle.reasonField().fill('Budget');

    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.closing()).toContainText('Closing the period');
    await expect(lifecycle.alert()).toHaveCount(0);
    await expect(lifecycle.canceled()).toContainText('Cancellation scheduled');
    // The very same request, twice: nothing was changed by the first.
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
  });

  test('is a link that opens it, from anywhere: the dialog says so when there is nothing to cancel', async ({
    page,
  }) => {
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await page.goto('/customers/instances/hooli-prod/billing/cancel');

    await expect(lifecycle.dialog()).toContainText(
      'This subscription is already canceled.',
    );
    await expect(lifecycle.cancelConfirmButton()).toHaveCount(0);
    await lifecycle.close();
    await expect(page).toHaveURL(
      /\/customers\/instances\/hooli-prod\/billing$/,
    );
  });

  test('keeps the dialog on the page of its own route, which a reload restores', async ({
    page,
  }) => {
    const lifecycle = new InstanceLifecycleDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await page.goto('/customers/instances/initech-prod/billing/cancel');
    await expect(lifecycle.cancelConfirmButton()).toBeVisible();
    await page.reload();

    await expect(lifecycle.cancelConfirmButton()).toBeVisible();
    await expect(lifecycle.dialog().getByRole('heading')).toContainText(
      'Cancel the subscription of Initech Production',
    );
  });
});

// A period that has ended is closed by a job, and the API refuses to change the
// subscription until it has run, without saying how long that takes: the console says
// so, sends the same request once more after a minute, and only then shows the refusal,
// with a way to ask again. The clock of the page is the test's, so that the minute is
// not waited for.
test.describe('cancelling while the period is being closed', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(BILLED_NOW) });
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('sends the same request again after a minute, shows the refusal when the second try fails too, and sends a third when asked', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    const model = createLifecycleBillingModel();
    model.subscriptions.armProblem('cancelSubscription', {
      code: 'CancelSubscription.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      retryAfterSeconds: 60,
      status: 409,
      times: 2,
    });
    await installBillingAppMocks(page, model);
    await billing.goto('initech-prod');
    await lifecycle.openCancel('Initech Production');
    await lifecycle.reasonField().fill('Budget');

    await lifecycle.cancelConfirmButton().click();

    // The first refusal is not an error: the dialog says what is happening.
    await expect(lifecycle.closing()).toContainText('Closing the period');
    await expect(lifecycle.alert()).toHaveCount(0);
    expect(writes).toHaveLength(1);
    await page.clock.runFor(59_000);
    expect(writes).toHaveLength(1);
    await page.clock.runFor(1_000);

    // One automatic resend, with the same body. Refused again: the words of the API and a Retry.
    await expect(lifecycle.alert()).toContainText(
      'the period has ended and is being closed',
    );
    await expect(lifecycle.closing()).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
    await lifecycle.alert().getByRole('button', { name: 'Retry' }).click();

    await expect(lifecycle.canceled()).toContainText('Cancellation scheduled');
    expect(writes).toHaveLength(3);
    await lifecycle.close();
    await expect(lifecycle.cancellationNotice()).toContainText(
      'Reason: Budget',
    );
  });
});
