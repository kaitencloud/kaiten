import { expect, expectToast, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { AddonFormDriver } from '../_support/drivers/addon-form.driver';
import { FormRecoveryDriver } from '../_support/drivers/form-recovery.driver';
import {
  createAddonsBillingModel,
  createEmptyAddonsBillingModel,
} from './addons.scenarios';
import { installAddonsWorld } from './install-addons-world';

// The unsent input of the add-on creation, as the console keeps it in the browser: a
// new family, or the next version of one, offered back after a reload for the same
// family only.

test('offers back a half-filled add-on after a reload, and forgets it once sent', async ({
  page,
}) => {
  const form = new AddonFormDriver(page);
  const recovery = new FormRecoveryDriver(page);
  await installAddonsWorld(page, createEmptyAddonsBillingModel());

  await page.goto('/catalog/addons/new');
  await form.expectOpen('New add-on');
  await expect(recovery.offer()).toHaveCount(0);
  await form.fill({ description: 'Ten more projects', name: 'Extra projects' });
  await expect.poll(() => readConsoleStorage(page)).toContain('Ten more projects');

  await page.reload();
  await form.expectOpen('New add-on');
  await expect(recovery.offer()).toBeVisible();
  await expect(form.nameField()).toHaveValue('');
  await expect(recovery.resumeButton()).toBeFocused();

  await recovery.resumeButton().click();
  await expect(recovery.offer()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('Extra projects');
  await expect(form.descriptionField()).toHaveValue('Ten more projects');
  await form.submit();

  await expectToast(page, 'Add-on created');
  await expect(page).toHaveURL('/catalog/addons/extra-projects');

  await page.goto('/catalog/addons/new');
  await form.expectOpen('New add-on');
  await page.reload();
  await form.expectOpen('New add-on');
  await expect(recovery.offer()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('');
});

test('offers the next version of a family only for that family', async ({
  page,
}) => {
  const form = new AddonFormDriver(page);
  const recovery = new FormRecoveryDriver(page);
  await installAddonsWorld(page, createAddonsBillingModel());

  await page.goto('/catalog/addons/new?family=extra-seats');
  await form.fill({ versionName: '2028' });
  await expect.poll(() => readConsoleStorage(page)).toContain('2028');

  await page.goto('/catalog/addons/new');
  await form.expectOpen('New add-on');
  await expect(recovery.offer()).toHaveCount(0);

  await page.goto('/catalog/addons/new?family=extra-seats');
  await expect(recovery.offer()).toBeVisible();
  await recovery.startOverButton().click();
  await expect(form.versionNameField()).toHaveValue('');
});
