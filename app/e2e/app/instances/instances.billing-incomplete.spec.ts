import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { InstanceAddonsDriver } from '../_support/drivers/instance-addons.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  INITECH_CHECKOUT_HOSTED_URL,
  INITECH_CHECKOUT_INVOICE_ID,
} from '../billing/lifecycle-world';

// A public checkout waits for the payment of its first invoice before it gives the
// instance anything: the Billing tab says what it waits for and until when, which
// license the payment moves the instance to, what the vendor may do meanwhile, and
// that the add-ons and the plan are fixed. The page is frozen at 7 Oct 12:00 UTC; the
// checkout started at 09:00 and lapses at 08:00 the next day.

const WRITES = /\/api\/instances\/[^/]+(\/billing\/cancel|\/addons\/[^/]+)?$/;

test.describe('a checkout waiting for its payment', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(
      page,
      createLifecycleBillingModel(billingCapabilitiesProfiles.stackWithAddons()),
    );
  });

  test('says until when the invoice can be paid, how long is left, and which license the payment moves the instance to', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-checkout');

    const notice = lifecycle.incompleteNotice();
    await expect(notice).toContainText(
      'Awaiting payment until Oct 8, 2026, 8:00 AM (UTC)',
    );
    await expect(notice).toContainText('20 hours left to pay');
    await expect(notice).toContainText('the instance keeps its license');
    await expect(notice).toContainText('Paying moves the instance to pro-v3');
    await expect(notice).toContainText('nothing the checkout bought applies');
  });

  test('puts the expiry under the badge and the license it moves to on the card, with no boundary to wait for', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('initech-checkout');

    const card = billing.subscriptionCard();
    await expect(card).toContainText('Awaiting payment');
    await expect(card.getByTestId('incomplete-expiry-hint')).toContainText(
      'Lapses Oct 8, 2026, 8:00 AM (UTC)',
    );
    await expect(billing.row(card, 'Moves to')).toContainText('pro-v3');
    await expect(
      card.getByText('Next boundary', { exact: true }),
    ).toHaveCount(0);
  });

  test('leads to the invoice it waits for, and to where Stripe hosts it for the customer', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-checkout');

    const notice = lifecycle.incompleteNotice();
    await expect(notice.getByTestId('incomplete-invoice-link')).toHaveAttribute(
      'href',
      `/invoices/${INITECH_CHECKOUT_INVOICE_ID}`,
    );
    const hosted = notice.getByTestId('incomplete-hosted-link');
    await expect(hosted).toHaveAttribute('href', INITECH_CHECKOUT_HOSTED_URL);
    await expect(hosted).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('greys the plan change out and says why, and keeps the terms and the cancellation', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);

    await billing.goto('initech-checkout');

    await expect(lifecycle.changePlanButton()).toBeDisabled();
    await lifecycle.changePlanButton().locator('xpath=..').hover();
    await expect(
      page.getByText('Unavailable until the first payment is made'),
    ).toBeVisible();
    await expect(lifecycle.termsLink()).toBeVisible();
    await expect(lifecycle.cancelLink()).toBeVisible();
  });

  test('offers no way to add an add-on, and says they are fixed until it is paid', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-checkout');

    await expect(addons.incompleteNote()).toContainText(
      'The add-ons are fixed until the checkout is paid',
    );
    await expect(addons.attachLink()).toHaveCount(0);
    await expect(addons.notLive()).toHaveCount(0);
  });

  test('cancels at once with no choice of date, says nothing is billed or undone, and the tab follows', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await billing.goto('initech-checkout');

    await lifecycle.openCancel('Initech Checkout');

    await expect(lifecycle.cancelModeField()).toHaveCount(0);
    await expect(lifecycle.cancelExplanation()).toContainText(
      'The checkout ends now',
    );
    await expect(lifecycle.cancelExplanation()).toContainText(
      'no final invoice is issued',
    );
    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.canceled()).toContainText('Checkout canceled');
    await expect(lifecycle.canceled()).not.toContainText('Final invoice');
    expect(writes).toEqual([
      {
        body: { mode: 'IMMEDIATE' },
        method: 'POST',
        pathname: '/api/instances/initech-checkout/billing/cancel',
      },
    ]);

    await lifecycle.close();
    await expect(billing.subscriptionCard()).toContainText('Canceled');
    await expect(lifecycle.incompleteNotice()).toHaveCount(0);
  });

  test('shows the notice to a session that only reads, without the cancellation', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);

    await billing.goto('initech-checkout');

    await expect(lifecycle.incompleteNotice()).toContainText(
      'Awaiting payment until',
    );
    await expect(lifecycle.actions()).toHaveCount(0);
  });
});

test.describe('a checkout pending over a free subscription', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(
      page,
      createLifecycleBillingModel(billingCapabilitiesProfiles.stackWithAddons()),
    );
  });

  test('says the free subscription goes on until the payment, and fixes the plan and the add-ons', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-upgrading');

    const notice = lifecycle.incompleteNotice();
    await expect(notice).toContainText('Awaiting payment until');
    await expect(notice).toContainText(
      'the checkout lapses and the free subscription goes on as it was',
    );
    await expect(billing.subscriptionCard()).toContainText('Active');
    await expect(
      billing.row(billing.subscriptionCard(), 'Moves to'),
    ).toContainText('pro-v3');
    await expect(lifecycle.changePlanButton()).toBeDisabled();
    await expect(addons.attachLink()).toHaveCount(0);
  });

  test('cancels the checkout alone: the invoice is voided and the free subscription goes on', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, WRITES);
    await billing.goto('initech-upgrading');

    await lifecycle.openCancel('Initech Upgrading');

    await expect(lifecycle.cancelModeField()).toHaveCount(0);
    await expect(lifecycle.cancelExplanation()).toContainText(
      'the free subscription goes on as it was',
    );
    await lifecycle.cancelConfirmButton().click();

    await expect(lifecycle.canceled()).toContainText('Checkout canceled');
    await expect(lifecycle.canceled()).toContainText(
      'the free subscription goes on as it was',
    );
    expect(writes).toEqual([
      {
        body: { mode: 'IMMEDIATE' },
        method: 'POST',
        pathname: '/api/instances/initech-upgrading/billing/cancel',
      },
    ]);

    await lifecycle.close();
    await expect(billing.subscriptionCard()).toContainText('Active');
    await expect(lifecycle.incompleteNotice()).toHaveCount(0);
  });
});

test.describe('a decrease of add-on scheduled for the next boundary', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
    await installBillingAppMocks(
      page,
      createLifecycleBillingModel(billingCapabilitiesProfiles.stackWithAddons()),
    );
  });

  test('keeps the quantity held on the stepper and says what it drops to, and when', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-shrinking');

    await expect(addons.quantity('Extra seats')).toHaveText('3');
    await expect(addons.pendingQuantity('Extra seats')).toContainText(
      'Drops to 1 on Oct 15, 2026 (UTC).',
    );
    await expect(addons.pendingQuantity('Extra seats')).toContainText(
      'A change made here replaces it.',
    );
  });

  test('is replaced by a change made here: the notice goes with it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);
    await billing.goto('initech-shrinking');

    await addons.more('Extra seats').click();

    await expect(addons.quantity('Extra seats')).toHaveText('4');
    await expect(addons.pendingQuantity('Extra seats')).toHaveCount(0);
  });
});
