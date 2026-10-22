import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createDeletableEntitlementModel,
  createEmptyEntitlementsModel,
} from './entitlements.scenarios';

test('creates an entitlement with a display order', async ({ page }) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Ordered Feature' });
  await expect(form.displayOrderField()).toHaveValue('0');
  await form.displayOrderField().fill('25');
  await form.clickNext();
  await form.submitButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/ordered-feature');

  // Round-trip: the configure wizard reflects the stored order on its first step.
  await page.goto('/catalog/entitlements/ordered-feature?mode=configure');
  await expect(form.displayOrderField()).toHaveValue('25');
});

test('holds the first step on a display order the API would refuse', async ({
  page,
}) => {
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, createEmptyEntitlementsModel());
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');
  await form.fill({ name: 'Fractional Order' });
  await expect(form.nextButton()).toBeEnabled();

  for (const order of ['1.5', '2147483648']) {
    await form.displayOrderField().fill(order);
    await form.displayOrderField().blur();

    await expect(form.nextButton()).toBeDisabled();
    // A disabled Next says why to a screen reader, whether or not the field is in view.
    await expect(form.nextButton()).toHaveAccessibleDescription(
      'Fill in the required fields correctly to continue.',
    );
  }

  // A fraction is told in the words of the form, not those of the validator.
  await form.displayOrderField().fill('1.5');
  await form.displayOrderField().blur();
  await expect(page.getByText('Enter a whole number')).toBeVisible();
  await expect(page.getByText(/Invalid input/)).toHaveCount(0);

  await form.displayOrderField().fill('7');
  await form.displayOrderField().blur();
  await expect(form.nextButton()).toBeEnabled();
});

test('sends the person back to the field of the first step when the stepper would go on without it', async ({
  page,
}) => {
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, createEmptyEntitlementsModel());
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');
  await form.fill({ name: 'Back To The Field' });
  await form.clickNext();
  await page.getByRole('button', { name: /Entitlement information/ }).click();
  await form.displayOrderField().fill('1.5');
  await form.displayOrderField().blur();

  await page.getByRole('button', { name: /Type configuration/ }).click();

  // The second step is not opened, the first says what is wrong and holds the focus.
  await form.expectLoaded('create');
  await expect(form.displayOrderField()).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(form.displayOrderField()).toBeFocused();
});

test('clearing the display order field keeps the form submittable (saves 0)', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Cleared Order' });
  // Clearing the number input yields NaN internally; the form must stay
  // submittable and persist the default order of 0.
  await form.displayOrderField().fill('');
  await form.clickNext();
  await form.submitButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/cleared-order');

  await page.goto('/catalog/entitlements/cleared-order?mode=configure');
  await expect(form.displayOrderField()).toHaveValue('0');
});

test('defaults display order to 0 and can be changed on edit', async ({
  page,
}) => {
  const model = createDeletableEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/catalog/entitlements/priority-support?mode=configure');

  await expect(form.displayOrderField()).toHaveValue('0');
  await form.displayOrderField().fill('3');
  // A BOOLEAN entitlement has no type step, so the update button lives on the
  // single identity step — no need to advance the wizard.
  await form.updateButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/priority-support');

  await page.goto('/catalog/entitlements/priority-support?mode=configure');
  await expect(form.displayOrderField()).toHaveValue('3');
});
