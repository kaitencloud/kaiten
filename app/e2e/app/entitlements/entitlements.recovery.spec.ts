import { expect, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { expectToast } from '../_support/assertions/toast';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createEmptyEntitlementsModel,
  createEntitlementsListModel,
} from './entitlements.scenarios';

const RECOVERY_KEY = 'kaiten:form-recovery';

// The unsent input of the creation page, as the console keeps it in the browser: what is
// typed on both steps, written as the person types, and offered back on the next visit.
async function fillBothSteps(form: EntitlementFormDriver) {
  await form.fill({
    description: 'Tracks the storage reads of a billing period',
    name: 'Storage Reads',
  });
  await form.clickNext();
  await form.fillUnits({ unitPlural: 'reads', unitSingular: 'read' });
}

test('offers back a half-filled creation after a reload, restores both steps, and forgets it once sent', async ({
  page,
}) => {
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, createEmptyEntitlementsModel());
  await page.goto('/catalog/entitlements/new');
  await form.expectLoaded('create');
  await expect(form.recoveryOffer()).toHaveCount(0);

  await fillBothSteps(form);
  await expect.poll(() => readConsoleStorage(page)).toContain('reads');

  await page.reload();
  await form.expectLoaded('create');
  await expect(form.recoveryOffer()).toBeVisible();
  await expect(form.recoveryOffer()).toContainText('step 2 of 2');
  // Nothing is restored without the click.
  await expect(form.unitSingularField()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('');

  // By the keyboard: the button leaves the page, and the focus has to follow into the form.
  await form.resumeButton().focus();
  await page.keyboard.press('Enter');
  await expect(form.recoveryOffer()).toHaveCount(0);
  await form.expectFocusOnAField();
  // Resume lands on the step it was left on, with its fields...
  await expect(form.unitSingularField()).toHaveValue('read');
  await expect(form.unitPluralField()).toHaveValue('reads');
  // ...and the other step still holds what was typed there.
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(form.nameField()).toHaveValue('Storage Reads');
  await expect(form.descriptionField()).toHaveValue(
    'Tracks the storage reads of a billing period',
  );
  await form.clickNext();

  await form.submitButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/storage-reads');

  // Sent: the next visit to the form starts blank, however it is reached.
  await page.goto('/catalog/entitlements/new');
  await form.expectLoaded('create');
  await expect(form.recoveryOffer()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('');
});

test('starts over on a blank form and drops the entries when the person chooses to', async ({
  page,
}) => {
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, createEmptyEntitlementsModel());
  await page.goto('/catalog/entitlements/new');
  await form.expectLoaded('create');
  await fillBothSteps(form);
  await expect.poll(() => readConsoleStorage(page)).toContain('reads');

  await page.reload();
  await expect(form.recoveryOffer()).toBeVisible();
  await form.startOverButton().click();

  await expect(form.recoveryOffer()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('');
  await form.expectFocusOnAField();

  await page.reload();
  await form.expectLoaded('create');
  await expect(form.recoveryOffer()).toHaveCount(0);
});

test('offers the entries back to a person who left the page by a link', async ({
  page,
}) => {
  const form = new EntitlementFormDriver(page);
  const list = new EntitlementsListDriver(page);

  await installEntitlementAppMocks(page, createEntitlementsListModel());
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');
  await form.fill({ name: 'Storage Reads' });
  await expect.poll(() => readConsoleStorage(page)).toContain('Storage Reads');

  // Leaving is not abandoning: the back button takes the person away...
  await page.goBack();
  await list.expectLoaded();

  // ...and the form, next time, offers what was typed.
  await list.openCreatePage();
  await form.expectLoaded('create');
  await expect(form.recoveryOffer()).toBeVisible();
  await form.resumeButton().click();
  await expect(form.nameField()).toHaveValue('Storage Reads');
});

test('discards the entries on Cancel, and brings them back from the toast', async ({
  page,
}) => {
  const form = new EntitlementFormDriver(page);
  const list = new EntitlementsListDriver(page);

  await installEntitlementAppMocks(page, createEntitlementsListModel());
  await page.goto('/catalog/entitlements/new');
  await form.expectLoaded('create');
  await form.fill({ name: 'Storage Reads' });
  await expect.poll(() => readConsoleStorage(page)).toContain('Storage Reads');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await list.expectLoaded();
  await expectToast(page, 'Entries discarded');

  // A deliberate abandon is not offered again...
  await list.openCreatePage();
  await form.expectLoaded('create');
  await expect(form.recoveryOffer()).toHaveCount(0);
  await expect(form.nameField()).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await list.expectLoaded();

  // ...unless the person undoes it: the page opens on the entries, with no offer to answer.
  await page.getByRole('button', { name: 'Undo' }).click();
  await form.expectLoaded('create');
  await expect(form.nameField()).toHaveValue('Storage Reads');
  await expect(form.recoveryOffer()).toHaveCount(0);
  await form.expectFocusOnAField();
});

test('keeps nothing of an edit, and never offers one', async ({ page }) => {
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, createEntitlementsListModel());
  await page.goto('/catalog/entitlements/api-calls?mode=configure');
  await expect(form.descriptionField()).toBeVisible();
  await form.descriptionField().fill('An edit that is not sent');
  // Past the second that a creation waits before it writes.
  await page.waitForTimeout(1_500);

  expect(await readConsoleStorage(page)).not.toContain(RECOVERY_KEY);

  await page.reload();
  await expect(form.descriptionField()).toBeVisible();
  await expect(form.recoveryOffer()).toHaveCount(0);
  await expect(form.descriptionField()).not.toHaveValue(
    'An edit that is not sent',
  );
  expect(await readConsoleStorage(page)).not.toContain(RECOVERY_KEY);
});
