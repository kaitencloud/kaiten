import { expect, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { FormRecoveryDriver } from '../_support/drivers/form-recovery.driver';
import { VoucherWizardDriver } from '../_support/drivers/voucher-wizard.driver';
import { BILLED_NOW } from '../billing/billed-instances';
import { installVouchersWorld } from './install-vouchers-world';

// The unsent input of the voucher wizard, as the console keeps it in the browser: what was
// typed on each step, offered back after a reload, never with the code, which a resume
// asks for again on the step that has it.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
  await installVouchersWorld(page);
});

test('offers back a half-made voucher after a reload, lands on the step of the code it does not keep, and forgets it once published', async ({
  page,
}) => {
  const wizard = new VoucherWizardDriver(page);
  const recovery = new FormRecoveryDriver(page);

  await wizard.goto();
  await expect(recovery.offer()).toHaveCount(0);
  await wizard.startAs('Discount', 'Spring');
  await wizard.percentageField().fill('20');
  await wizard.next().click();
  await wizard.expectStep('Who and when');
  await wizard.codeField().fill('SPRING-2027-LAUNCH');
  await wizard.maxRedemptionsField().fill('100');
  await expect.poll(() => readConsoleStorage(page)).toContain('Spring');
  expect(await readConsoleStorage(page)).not.toContain('SPRING-2027-LAUNCH');

  await page.reload();
  await wizard.expectLoaded();
  await expect(recovery.offer()).toBeVisible();
  await expect(recovery.offer()).toContainText('step 3 of 4');
  await expect(recovery.offer()).toContainText('Custom code');
  await expect(wizard.nameField()).toHaveValue('');

  await recovery.resumeButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  await wizard.expectStep('Who and when');
  await expect(wizard.codeField()).toHaveValue('');
  await expect(wizard.maxRedemptionsField()).toHaveValue('100');
  await wizard.back().click();
  await expect(wizard.percentageField()).toHaveValue('20');
  await wizard.next().click();

  await wizard.codeField().fill('SPRING-2027-LAUNCH');
  await wizard.next().click();
  await wizard.expectStep('Review');
  await wizard.publishButton().click();
  await expect(wizard.published()).toBeVisible();

  await wizard.goto();
  await page.reload();
  await wizard.expectLoaded();
  await expect(recovery.offer()).toHaveCount(0);
  await expect(wizard.nameField()).toHaveValue('');
});

test('starts over on a blank wizard when the person chooses to', async ({
  page,
}) => {
  const wizard = new VoucherWizardDriver(page);
  const recovery = new FormRecoveryDriver(page);

  await wizard.goto();
  await wizard.nameField().fill('Spring');
  await expect.poll(() => readConsoleStorage(page)).toContain('Spring');

  await page.reload();
  await recovery.startOverButton().click();
  await expect(wizard.nameField()).toHaveValue('');
  await page.reload();
  await wizard.expectLoaded();
  await expect(recovery.offer()).toHaveCount(0);
});
