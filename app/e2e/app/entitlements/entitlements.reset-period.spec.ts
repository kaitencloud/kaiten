import { expect, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createEmptyEntitlementsModel,
  createPeriodicEntitlementModel,
  createThresholdEntitlementModel,
} from './entitlements.scenarios';

test('creates an entitlement whose usage resets every month', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'API Calls' });
  await form.clickNext();
  await form.selectResetPeriod('Every month');
  await form.selectResetAnchor('License start date');
  await form.submitButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/api-calls');

  // Round-trip: the stored cadence comes back, and the one-way door has shut.
  await page.goto('/catalog/entitlements/api-calls?mode=configure');
  await form.clickNext();
  await expect(form.resetPeriodTrigger()).toContainText('Every month');
  await expect(form.resetAnchorTrigger()).toContainText('License start date');
  await expect(form.resetPeriodTrigger()).toBeDisabled();
  await expect(form.resetAnchorTrigger()).toBeDisabled();
});

// The regression entitlementToUpdateBody and resolveResetFields both exist to
// prevent: a full-replace PUT that drops the pair reads as an attempted
// removal. The app model rejects that, so this fails loudly if either path
// stops echoing the stored window back.
test('keeps the stored window when editing a periodic entitlement', async ({
  page,
}) => {
  const model = createPeriodicEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await page.goto('/catalog/entitlements/api-calls?mode=configure');

  await form.fill({ name: 'API Calls Renamed' });
  await form.clickNext();
  await form.updateButton().click();
  await expect(page).toHaveURL('/catalog/entitlements/api-calls');

  await page.goto('/catalog/entitlements/api-calls?mode=configure');
  await form.clickNext();
  await expect(form.resetPeriodTrigger()).toContainText('Every month');
  await expect(form.resetAnchorTrigger()).toContainText('Calendar');
});

test.describe('the billing date as the alignment of a window', () => {
  const hint = (page: import('@playwright/test').Page) =>
    page.getByTestId('reset-anchor-billing-period-hint');
  const backToCalendar = (page: import('@playwright/test').Page) =>
    page.getByTestId('reset-anchor-back-to-calendar');

  test('is chosen on a monthly cadence, said before it is sent, and fixed once set', async ({
    page,
  }) => {
    const model = createEmptyEntitlementsModel();
    const list = new EntitlementsListDriver(page);
    const form = new EntitlementFormDriver(page);

    await installEntitlementAppMocks(page, model);
    await list.goto();
    await list.openCreatePage();
    await form.expectLoaded('create');

    await form.fill({ name: 'API Calls' });
    await form.clickNext();
    await form.selectResetPeriod('Every month');
    await expect(hint(page)).toHaveCount(0);
    await form.selectResetAnchor('Billing date');
    await expect(hint(page)).toContainText(
      'follow the billing date of an instance with a live subscription',
    );
    await form.submitButton().click();
    await expect(page).toHaveURL('/catalog/entitlements/api-calls');

    // The pair came back as sent, and the door has shut on both members, with the reason.
    await page.goto('/catalog/entitlements/api-calls?mode=configure');
    await form.fill({ name: 'API Calls Renamed' });
    await form.clickNext();
    await expect(form.resetPeriodTrigger()).toContainText('Every month');
    await expect(form.resetAnchorTrigger()).toContainText('Billing date');
    await expect(form.resetAnchorTrigger()).toBeDisabled();
    await expect(hint(page)).toBeVisible();
    await expect(page.locator('[data-field-name="resetAnchor"]')).toContainText(
      'The alignment is fixed with the cadence once set',
    );

    // Editing something else sends the stored pair back untouched: the model refuses
    // an edit that changes or drops it.
    await form.updateButton().click();
    await expect(page).toHaveURL('/catalog/entitlements/api-calls');
    await page.goto('/catalog/entitlements/api-calls?mode=configure');
    await expect(form.nameField()).toHaveValue('API Calls Renamed');
    await form.clickNext();
    await expect(form.resetPeriodTrigger()).toContainText('Every month');
    await expect(form.resetAnchorTrigger()).toContainText('Billing date');
  });

  test('is listed on a short cadence with the reason it cannot be chosen', async ({
    page,
  }) => {
    const model = createEmptyEntitlementsModel();
    const list = new EntitlementsListDriver(page);
    const form = new EntitlementFormDriver(page);

    await installEntitlementAppMocks(page, model);
    await list.goto();
    await list.openCreatePage();
    await form.fill({ name: 'API Calls' });
    await form.clickNext();
    await form.selectResetPeriod('Every day');
    await form.resetAnchorTrigger().click();

    const unavailable = page.getByRole('option', {
      name: 'Billing date (monthly or yearly only)',
      exact: true,
    });
    await expect(unavailable).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByRole('option', { name: 'Billing date', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-field-name="resetAnchor"]')).toContainText(
      'They need a monthly or yearly cadence',
    );
  });

  test('falls back to the calendar when the cadence moves to one it cannot follow', async ({
    page,
  }) => {
    const model = createEmptyEntitlementsModel();
    const list = new EntitlementsListDriver(page);
    const form = new EntitlementFormDriver(page);

    await installEntitlementAppMocks(page, model);
    await list.goto();
    await list.openCreatePage();
    await form.fill({ name: 'API Calls' });
    await form.clickNext();
    await form.selectResetPeriod('Every year');
    await form.selectResetAnchor('Billing date');
    await expect(form.resetAnchorTrigger()).toContainText('Billing date');

    await expect(backToCalendar(page)).toHaveCount(0);

    await form.selectResetPeriod('Every week');
    await expect(form.resetAnchorTrigger()).toContainText('Calendar');
    await expect(hint(page)).toHaveCount(0);
    // The person is told their choice was changed, until they choose again.
    await expect(backToCalendar(page)).toContainText(
      'The alignment was set back to Calendar',
    );
    await form.selectResetAnchor('License start date');
    await expect(backToCalendar(page)).toHaveCount(0);
  });

  test('is adopted once by a lifetime counter, with the anchor chosen then', async ({
    page,
  }) => {
    const model = createThresholdEntitlementModel();
    const form = new EntitlementFormDriver(page);

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/api-calls?mode=configure');
    await form.clickNext();
    await expect(form.resetPeriodTrigger()).toBeEnabled();

    await form.selectResetPeriod('Every year');
    await expect(form.resetAnchorTrigger()).toBeEnabled();
    await form.selectResetAnchor('Billing date');
    await form.updateButton().click();
    await expect(page).toHaveURL('/catalog/entitlements/api-calls');

    await page.goto('/catalog/entitlements/api-calls?mode=configure');
    await form.clickNext();
    await expect(form.resetPeriodTrigger()).toContainText('Every year');
    await expect(form.resetAnchorTrigger()).toContainText('Billing date');
    await expect(form.resetPeriodTrigger()).toBeDisabled();
    await expect(form.resetAnchorTrigger()).toBeDisabled();
  });

  test('shows the refusal of the API on the anchor in the words of the console, and lets it be sent again once the anchor changes', async ({
    page,
  }) => {
    const model = createEmptyEntitlementsModel();
    const list = new EntitlementsListDriver(page);
    const form = new EntitlementFormDriver(page);
    const detail = 'resetAnchor BILLING_PERIOD takes resetPeriod MONTH or YEAR';
    const sentence =
      'The billing date needs a monthly or yearly cadence. Choose another alignment or another cadence.';
    model.setNextProblem('create', {
      code: 'CreateEntitlement.InvalidResetAnchor',
      detail,
      status: 422,
    });

    await installEntitlementAppMocks(page, model);
    await list.goto();
    await list.openCreatePage();
    await form.fill({ name: 'API Calls' });
    await form.clickNext();
    await form.selectResetPeriod('Every month');
    await form.selectResetAnchor('Billing date');
    await form.submitButton().click();

    await expect(page.locator('[data-field-name="resetAnchor"]')).toContainText(
      sentence,
    );
    await expect(
      page.locator('[data-field-name="resetAnchor"]'),
    ).not.toContainText(detail);
    await expect(page).toHaveURL(/\/catalog\/entitlements\/new/);

    await form.selectResetAnchor('Calendar');
    await expect(
      page.locator('[data-field-name="resetAnchor"]'),
    ).not.toContainText(sentence);
    await form.submitButton().click();
    await expect(page).toHaveURL('/catalog/entitlements/api-calls');
  });

  test('says a refusal about a read-only pair above the buttons, and lets the form be sent again', async ({
    page,
  }) => {
    const model = createPeriodicEntitlementModel();
    const form = new EntitlementFormDriver(page);
    model.setNextProblem('update', {
      code: 'UpdateEntitlement.ImmutableResetAnchor',
      detail: 'resetAnchor cannot be changed once set',
      status: 400,
    });

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/api-calls?mode=configure');
    await form.fill({ name: 'API Calls Renamed' });
    await form.clickNext();
    await form.updateButton().click();

    // The field is read-only, so the refusal is not pinned to it: it is said in the
    // words of the console, and the form is not stuck.
    await expect(page.getByTestId('entitlement-refusal')).toContainText(
      'The alignment of the usage windows was set once and cannot be changed',
    );
    await expect(
      page.getByText('resetAnchor cannot be changed once set'),
    ).toHaveCount(0);
    await expect(form.updateButton()).toBeEnabled();
    await expect(page).toHaveURL(/mode=configure/);

    await form.updateButton().click();
    await expect(page).toHaveURL('/catalog/entitlements/api-calls');
  });
});
