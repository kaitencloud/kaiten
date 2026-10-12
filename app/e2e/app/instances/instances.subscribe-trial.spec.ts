import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../_support/drivers/instance-lifecycle.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import {
  billingCapabilities,
  NO_BILLING_FEATURES,
} from '../_support/model/billing-capabilities';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
} from '../billing/lifecycle-world';

// A trial at the start of a subscription, where the release has trials: it starts at
// the days the license carries, nothing is billed during it, the first invoice is issued
// when it ends. A price billed in arrears has none, and a release with no trial does
// not ask. The days go to the API even when they are none, so that what the license
// carries does not apply behind the back of the person who read the form.

const SUBSCRIPTION_WRITES = /\/api\/instances\/[^/]+\/billing$/;

test.describe('subscribing an instance with a trial', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('starts at the days the license carries, and says when the trial ends and when the first invoice is issued', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-fresh');

    await billing.openSubscribe();

    await expect(billing.trialDaysField()).toHaveValue('14');
    await expect(billing.summary()).toContainText(
      'No invoice now. The first invoice is issued at the end of the trial, on Oct 21, 2026',
    );
  });

  test('starts the subscription in trial, nothing billed, and the tab says so', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const lifecycle = new InstanceLifecycleDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-fresh');
    await billing.openSubscribe();

    await billing.confirmButton().click();

    await expect(billing.started()).toContainText('Subscription started');
    await expect(billing.started()).toContainText('Trial');
    await expect(billing.started()).toContainText(
      'The trial runs until Oct 21, 2026',
    );
    // No invoice yet: nothing is billed during a trial.
    await expect(billing.started()).not.toContainText('Activation invoice');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({
      trialDays: 14,
      providerKind: 'NOOP',
    });

    await billing.close();
    await expect(lifecycle.trialNotice()).toContainText(
      'Trial until Oct 21, 2026',
    );
    await expect(lifecycle.trialNotice()).toContainText('14 days left');
    await expect(billing.invoiceRows()).toHaveCount(0);
  });

  test('sends none when the days are changed to zero, which starts billing at once', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-fresh');
    await billing.openSubscribe();

    await billing.trialDaysField().fill('0');
    await expect(billing.summary()).toContainText(
      'The first invoice is issued as soon as the subscription starts.',
    );
    await billing.confirmButton().click();

    await expect(billing.started()).toContainText('Active');
    await expect(billing.started()).toContainText('Activation invoice:');
    // Said as zero: the license carries 14 days, which must not apply.
    expect(writes[0].body).toMatchObject({ trialDays: 0 });
  });

  test('sends the days that were typed', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-fresh');
    await billing.openSubscribe();

    await billing.trialDaysField().fill('30');
    await billing.confirmButton().click();

    await expect(billing.started()).toContainText(
      'The trial runs until Nov 6, 2026',
    );
    expect(writes[0].body).toMatchObject({ trialDays: 30 });
  });

  test('refuses a trial longer than the bound the console puts on it, in words, before the API does', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-fresh');
    await billing.openSubscribe();

    await billing.trialDaysField().fill('366');
    await billing.trialDaysField().blur();

    await expect(billing.dialog()).toContainText(
      'Enter a whole number of days, from 0 to 365',
    );
    await expect(billing.confirmButton()).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('has no trial for a price billed in arrears, says so, and sends none', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await billing.goto('initech-fresh');
    await billing.openSubscribe();

    await billing.chooseBasePrice(/Pro v2, annual/);

    await expect(billing.trialDaysField()).toHaveCount(0);
    await expect(billing.trialUnavailable()).toContainText(
      'A trial is not offered on a plan billed in arrears: the subscription starts without one.',
    );
    await billing.confirmButton().click();

    await expect(billing.started()).toContainText('Subscription started');
    expect(writes[0].body).toMatchObject({ trialDays: 0 });
  });

  test('does not ask for a trial where the release has none, and sends no days', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, SUBSCRIPTION_WRITES, ['POST']);
    await installBillingAppMocks(
      page,
      createLifecycleBillingModel(
        billingCapabilities({
          features: { ...NO_BILLING_FEATURES, lifecycle: true },
        }),
      ),
    );
    await billing.goto('initech-fresh');
    await billing.openSubscribe();

    await expect(billing.trialDaysField()).toHaveCount(0);
    await expect(billing.trialUnavailable()).toHaveCount(0);
    await billing.confirmButton().click();

    await expect(billing.started()).toBeVisible();
    expect(writes[0].body).not.toHaveProperty('trialDays');
  });
});
