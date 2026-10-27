import { expect, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { FormRecoveryDriver } from '../_support/drivers/form-recovery.driver';
import { InstanceFormDriver } from '../_support/drivers/instance-form.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createEmptyInstancesModel } from './instances.scenarios';

// The unsent input of the instance creation, as the console keeps it in the browser:
// offered back after a reload on the step it was left on, and forgotten once sent.

test('offers back a half-filled instance after a reload, on its step, and forgets it once sent', async ({
  page,
}) => {
  const form = new InstanceFormDriver(page);
  const recovery = new FormRecoveryDriver(page);
  await installInstanceAppMocks(page, createEmptyInstancesModel());

  await page.goto('/customers/instances/new');
  await expect(form.nameField()).toBeVisible();
  await expect(recovery.offer()).toHaveCount(0);
  await form.fillDetails({
    description: 'Regional production environment for Europe',
    name: 'Acme Europe',
  });
  await form.chooseCustomer('Acme Corp');
  await form.clickNext();
  await form.expectStepVisible('Choose the license');
  await form.chooseLicense('Enterprise v2026.1');
  await expect
    .poll(() => readConsoleStorage(page))
    .toContain('Regional production environment for Europe');

  await page.reload();
  await expect(recovery.offer()).toBeVisible();
  await expect(recovery.resumeButton()).toBeFocused();
  await expect(form.nameField()).toHaveValue('');

  await recovery.resumeButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  await form.expectStepVisible('Choose the license');
  await form.clickNext();
  await form.expectStepVisible('Deployment');
  await form.clickCreate();
  await expect(page).toHaveURL('/customers/instances/acme-europe');

  // Sent: the next visit to the form starts blank, reload or not.
  await page.goto('/customers/instances/new');
  await expect(form.nameField()).toBeVisible();
  await page.reload();
  await expect(form.nameField()).toHaveValue('');
  await expect(recovery.offer()).toHaveCount(0);
});

test('starts over on a blank form when the person chooses to', async ({
  page,
}) => {
  const form = new InstanceFormDriver(page);
  const recovery = new FormRecoveryDriver(page);
  await installInstanceAppMocks(page, createEmptyInstancesModel());

  await page.goto('/customers/instances/new');
  await form.fillDetails({ name: 'Acme Europe' });
  await expect.poll(() => readConsoleStorage(page)).toContain('Acme Europe');

  await page.reload();
  await recovery.startOverButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('');

  await page.reload();
  await expect(form.nameField()).toBeVisible();
  await expect(recovery.offer()).toHaveCount(0);
});
