import { expect, expectToast, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { CustomerFormDriver } from '../_support/drivers/customer-form.driver';
import { FormRecoveryDriver } from '../_support/drivers/form-recovery.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createSubscriptionsModel } from '../billing/billing.scenarios';
import { createBillingCustomersModel } from './customers.scenarios';

// The unsent input of the customer creation, as the console keeps it in the browser:
// offered back after a reload, never with the billing e-mail, which is a person's
// address and is to be entered again.

test('offers back a half-filled customer after a reload, without its billing e-mail, and forgets it once sent', async ({
  page,
}) => {
  const form = new CustomerFormDriver(page);
  const recovery = new FormRecoveryDriver(page);
  await installBillingAppMocks(page, createSubscriptionsModel());
  await installCustomerAppMocks(page, createBillingCustomersModel());

  await page.goto('/customers/new');
  await expect(recovery.offer()).toHaveCount(0);
  await form.fill({
    billingEmail: 'billing@orbit.dev',
    domain: 'orbit.dev',
    name: 'Orbit Labs',
  });
  await expect.poll(() => readConsoleStorage(page)).toContain('orbit.dev');
  expect(await readConsoleStorage(page)).not.toContain('billing@orbit.dev');

  await page.reload();
  await expect(recovery.offer()).toBeVisible();
  await expect(recovery.offer()).toContainText('Billing e-mail');
  // Nothing is restored without the click, and the focus waits on the offer.
  await expect(form.nameField()).toHaveValue('');
  await expect(recovery.resumeButton()).toBeFocused();

  await recovery.resumeButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('Orbit Labs');
  await expect(form.domainField()).toHaveValue('orbit.dev');
  await expect(form.billingEmailField()).toHaveValue('');

  await form.billingEmailField().fill('billing@orbit.dev');
  await form.createButton().click();
  await expectToast(page, 'Customer created successfully');
  await expect(page).toHaveURL('/customers/orbit-labs');

  // Sent: the next visit to the form starts blank, reload or not.
  await page.goto('/customers/new');
  await expect(form.nameField()).toBeVisible();
  await expect(recovery.offer()).toHaveCount(0);
  await page.reload();
  await expect(form.nameField()).toHaveValue('');
  await expect(recovery.offer()).toHaveCount(0);
});

test('starts over on a blank form when the person chooses to', async ({
  page,
}) => {
  const form = new CustomerFormDriver(page);
  const recovery = new FormRecoveryDriver(page);
  await installCustomerAppMocks(page, createBillingCustomersModel());

  await page.goto('/customers/new');
  await form.fill({ name: 'Orbit Labs' });
  await expect.poll(() => readConsoleStorage(page)).toContain('Orbit Labs');

  await page.reload();
  await recovery.startOverButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('');

  await page.reload();
  await expect(form.nameField()).toBeVisible();
  await expect(recovery.offer()).toHaveCount(0);
});

test('keeps nothing on the edit of a customer', async ({ page }) => {
  const form = new CustomerFormDriver(page);
  await installCustomerAppMocks(page, createBillingCustomersModel());
  await page.goto('/customers/new');
  await form.fill({ name: 'Orbit Labs' });
  await form.createButton().click();
  await expect(page).toHaveURL('/customers/orbit-labs');

  await page.goto('/customers/orbit-labs?mode=configure');
  await form.nameField().fill('Orbit Labs Renamed');
  await page.waitForTimeout(600);

  expect(await readConsoleStorage(page)).not.toContain('Orbit Labs Renamed');
});
