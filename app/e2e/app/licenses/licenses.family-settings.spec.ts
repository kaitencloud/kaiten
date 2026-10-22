import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { LicenseFamilySettingsDriver } from '../_support/drivers/license-family-settings.driver';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import {
  createBillingDisabledModel,
  createBillingStackModel,
} from '../billing/billing.scenarios';
import { createFamilySettingsCatalogModel } from './licenses.scenarios';

// What a family of licenses does around its subscriptions: the free license an
// instance falls back to when a subscription ends, what a trial that ends without a
// payment method becomes, and how long before a trial ends it announces it. They are
// settings of the family, changed with a partial update that carries only what was
// changed, and they are billing's: where billing is not there, there is nothing to edit.

const FAMILY_WRITES = /^\/api\/license-families\/[^/]+$/;

test.describe('the settings of a family of licenses', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('open from the row of the family, over the list, with what the API has stored', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await list.goto();

    await settings.open('Enterprise');

    await expect(page).toHaveURL(
      /\/catalog\/licenses\?familySettings=enterprise$/,
    );
    await expect(settings.fallback()).toContainText('Community');
    await expect(settings.trialEnd()).toContainText(
      'Convert it to an active subscription',
    );
    await expect(settings.reminder()).toHaveValue('7');
    // The page stays under the dialog.
    await expect(list.family('Pro')).toBeVisible();

    await settings.cancel().click();
    await expect(settings.dialog()).toHaveCount(0);
    await expect(page).toHaveURL(/\/catalog\/licenses$/);
  });

  test('start from the defaults of the API for a family that never changed them', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await list.goto();

    await settings.open('Pro');

    await expect(settings.fallback()).toContainText('No fallback');
    await expect(settings.trialEnd()).toContainText('Cancel it');
    await expect(settings.reminder()).toHaveValue('3');
  });

  test('can be opened by their address, and a family that does not exist closes them', async ({
    page,
  }) => {
    const settings = new LicenseFamilySettingsDriver(page);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());

    await page.goto('/catalog/licenses?familySettings=pro');
    await expect(settings.dialog()).toBeVisible();

    await page.goto('/catalog/licenses?familySettings=nothing-here');
    await expect(page).toHaveURL(/\/catalog\/licenses$/);
    await expect(settings.dialog()).toHaveCount(0);
  });

  test('offer as a fallback the other families whose every version is free, and none', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await list.goto();

    await settings.open('Pro');

    expect(await settings.options(settings.fallback())).toEqual([
      'No fallback',
      'Basic',
      'Community',
    ]);
  });

  test('send only the settings that were changed', async ({ page }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    const writes = recordWrites(page, FAMILY_WRITES);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await list.goto();

    await settings.open('Pro');
    await settings.reminder().fill('10');
    await settings.save().click();

    await expectToast(page, 'The license settings were saved');
    await expect(settings.dialog()).toHaveCount(0);
    expect(writes).toEqual([
      {
        body: { trialReminderDays: 10 },
        method: 'PATCH',
        pathname: '/api/license-families/pro',
      },
    ]);

    // The list reads them again: they are what the dialog opens with now.
    await settings.open('Pro');
    await expect(settings.reminder()).toHaveValue('10');
    await expect(settings.fallback()).toContainText('No fallback');
  });

  test('set a fallback, change what a trial becomes, and take the fallback away with the empty string', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    const writes = recordWrites(page, FAMILY_WRITES);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await list.goto();

    await settings.open('Pro');
    await settings.choose(settings.fallback(), 'Basic');
    await settings.choose(
      settings.trialEnd(),
      'Convert it to an active subscription',
    );
    await settings.save().click();
    await expectToast(page, 'The license settings were saved');

    await settings.open('Pro');
    await expect(settings.fallback()).toContainText('Basic');
    await settings.choose(settings.fallback(), 'No fallback');
    await settings.save().click();
    await expect(settings.dialog()).toHaveCount(0);

    expect(writes.map(({ body }) => body)).toEqual([
      {
        fallbackLicenseFamilySlug: 'basic',
        trialEndWithoutPaymentMethod: 'CONVERT',
      },
      { fallbackLicenseFamilySlug: '' },
    ]);
  });

  test('cannot be saved before something is changed', async ({ page }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    const writes = recordWrites(page, FAMILY_WRITES);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await list.goto();

    await settings.open('Pro');
    await expect(settings.save()).toBeDisabled();
    await settings.reminder().fill('4');
    await expect(settings.save()).toBeEnabled();
    expect(writes).toEqual([]);
  });

  test('send nothing when a setting is put back where it was', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    const writes = recordWrites(page, FAMILY_WRITES);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await list.goto();

    await settings.open('Pro');
    await settings.reminder().fill('4');
    await settings.reminder().fill('3');
    await settings.save().click();

    await expect(settings.dialog()).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test('refuse a reminder out of range in the words of the form, and send nothing', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    const writes = recordWrites(page, FAMILY_WRITES);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await list.goto();

    await settings.open('Pro');
    await settings.reminder().fill('45');
    await settings.reminder().blur();

    await expect(settings.field('trialReminderDays')).toContainText(
      'Enter a whole number of days from 1 to 30',
    );
    await expect(settings.save()).toBeDisabled();
    expect(writes).toEqual([]);

    await settings.reminder().fill('30');
    await expect(settings.save()).toBeEnabled();
  });

  test('show the refusal of the API on the field it names, and let it be sent again once the field changes', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    const model = createFamilySettingsCatalogModel();
    const detail =
      'fallbackLicenseFamilySlug names another FREE family of the organization: every version of it priced FREE';
    model.setNextProblem('updateLicenseFamily', {
      code: 'UpdateLicenseFamily.InvalidFallback',
      detail,
      status: 422,
    });
    await installLicenseAppMocks(page, model);
    await list.goto();

    await settings.open('Pro');
    await settings.choose(settings.fallback(), 'Basic');
    await settings.save().click();

    await expect(settings.field('fallbackLicenseFamilySlug')).toContainText(
      detail,
    );
    await expect(settings.dialog()).toBeVisible();

    await settings.choose(settings.fallback(), 'Community');
    await expect(settings.field('fallbackLicenseFamilySlug')).not.toContainText(
      detail,
    );
    await settings.save().click();
    await expectToast(page, 'The license settings were saved');
  });

  for (const refusal of [
    {
      change: async (settings: LicenseFamilySettingsDriver) =>
        settings.reminder().fill('12'),
      code: 'UpdateLicenseFamily.InvalidTrialReminderDays',
      detail: 'trialReminderDays is between 1 and 30',
      field: 'trialReminderDays',
    },
    {
      change: async (settings: LicenseFamilySettingsDriver) =>
        settings.choose(
          settings.trialEnd(),
          'Convert it to an active subscription',
        ),
      code: 'UpdateLicenseFamily.InvalidTrialEndBehavior',
      detail: 'trialEndWithoutPaymentMethod is CANCEL or CONVERT',
      field: 'trialEndWithoutPaymentMethod',
    },
  ]) {
    test(`show the refusal ${refusal.code} on its field`, async ({ page }) => {
      const list = new LicensesListDriver(page);
      const settings = new LicenseFamilySettingsDriver(page);
      const model = createFamilySettingsCatalogModel();
      model.setNextProblem('updateLicenseFamily', {
        code: refusal.code,
        detail: refusal.detail,
        status: 422,
      });
      await installLicenseAppMocks(page, model);
      await list.goto();

      await settings.open('Pro');
      await refusal.change(settings);
      await settings.save().click();

      await expect(settings.field(refusal.field)).toContainText(refusal.detail);
      await expect(settings.dialog()).toBeVisible();
    });
  }

  test('say any other refusal above the buttons, and keep what was typed', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    const model = createFamilySettingsCatalogModel();
    model.setNextProblem('updateLicenseFamily', {
      code: 'UpdateLicenseFamily.NotFound',
      detail: 'license family "pro" not found',
      status: 404,
    });
    await installLicenseAppMocks(page, model);
    await list.goto();

    await settings.open('Pro');
    await settings.reminder().fill('12');
    await settings.save().click();

    await expect(settings.dialog()).toContainText(
      'license family "pro" not found',
    );
    await expect(settings.reminder()).toHaveValue('12');
  });
});

test.describe('the link to the settings of a family', () => {
  test('is not there where billing is off', async ({ page }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await list.goto();

    await expect(list.family('Pro')).toBeVisible();
    await expect(settings.link('Pro')).toHaveCount(0);
  });

  test('is not there for a session that may only read', async ({ page }) => {
    const list = new LicensesListDriver(page);
    const settings = new LicenseFamilySettingsDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installLicenseAppMocks(page, createFamilySettingsCatalogModel());
    await installBillingAppMocks(page, createBillingStackModel());

    await list.goto();

    await expect(list.family('Pro')).toBeVisible();
    await expect(settings.link('Pro')).toHaveCount(0);
  });
});
