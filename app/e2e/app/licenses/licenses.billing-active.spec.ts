import { expect, test } from '../_support/app-test';
import { expectNoToast } from '../_support/assertions/toast';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicenseFreezeDriver } from '../_support/drivers/license-freeze.driver';
import { LicensePriceDrawerDriver } from '../_support/drivers/license-price-drawer.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingStackModel } from '../billing/billing.scenarios';
import {
  createBilledCatalogModel,
  createDraftPricesModel,
  createPricedCatalogModel,
} from './licenses.scenarios';

// What a version sells cannot change once a live subscription bills it, and the
// prices of a published version are immutable. The API refuses with a code for
// each, and every refusal has the same answer: a new version, which starts from
// this one with its entitlements and its prices. The console shows the refusal
// as a dialog that says what the API said and offers it, never as a toast.

const BILLED_SLUG = 'pro-v2';

test.describe('a version that cannot be changed any more', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('refuses the edit of a grant with a dialog that says what the API said, and offers a new version', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    await installLicenseAppMocks(page, createBilledCatalogModel());

    await detail.goto(BILLED_SLUG, 'Pro');
    await detail.editThreshold('Traces', '100,000', '150000');

    await freeze.expectTitle('This version is billed');
    await expect(freeze.detail()).toContainText(
      'a live subscription bills this licence version',
    );
    await expect(freeze.createNewVersion()).toHaveAttribute(
      'href',
      '/catalog/licenses/versions/pro-v2?draft=true',
    );
    // A dialog, not a toast.
    await expectNoToast(page);
  });

  test('refuses a new grant the same way', async ({ page }) => {
    const detail = new LicenseDetailDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    await installLicenseAppMocks(page, createBilledCatalogModel());

    await detail.goto(BILLED_SLUG, 'Pro');
    await detail.addNumericGrant('Latency', '500');

    await freeze.expectTitle('This version is billed');
    await expect(freeze.detail()).toContainText('what it sells is frozen');
    await expectNoToast(page);
  });

  test('refuses the removal of a grant the same way', async ({ page }) => {
    const detail = new LicenseDetailDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    await installLicenseAppMocks(page, createBilledCatalogModel());

    await detail.goto(BILLED_SLUG, 'Pro');
    await detail.removeGrant('Seats');

    await freeze.expectTitle('This version is billed');
    await expectNoToast(page);
    // Nothing left the version.
    await freeze.dialog().getByRole('button', { name: 'Cancel' }).click();
    await expect(detail.grantRow('Seats')).toBeVisible();
  });

  test('closes the dialog and leaves the version as it was', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    await installLicenseAppMocks(page, createBilledCatalogModel());

    await detail.goto(BILLED_SLUG, 'Pro');
    await detail.editThreshold('Traces', '100,000', '150000');
    await freeze.dialog().getByRole('button', { name: 'Cancel' }).click();

    await expect(freeze.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/catalog/licenses/pro-v2');
    await expect(
      detail.grantRow('Traces').getByRole('button', { name: '100,000' }),
    ).toBeVisible();
  });

  test('refuses a new price on a billed version in a dialog, which closes the drawer', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    await installLicenseAppMocks(page, createBilledCatalogModel());

    await prices.goto(BILLED_SLUG, 'Pro');
    await prices.addPrice().click();
    await drawer.chooseModel('Flat fee');
    await drawer.choosePeriod('Annual');
    await drawer.amount().fill('290');
    await drawer.submit('Create price').click();

    await freeze.expectTitle('This version is billed');
    await expect(freeze.detail()).toContainText('what it sells is frozen');
    await drawer.expectClosed();
    await expectNoToast(page);
  });

  test('refuses the edit of a price of a version that was published meanwhile, with its own explanation', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    const model = createDraftPricesModel();
    // The draft was published by someone else while this page showed it as one.
    model.setNextProblem('updatePrice', {
      code: 'UpdateLicensePrice.VersionNotDraft',
      detail:
        'the prices of a published or archived version are immutable: deprecate this one, or price a new version',
      status: 409,
    });
    await installLicenseAppMocks(page, model);

    await prices.goto('pro-v4', 'Pro');
    await prices.edit('Pro, monthly').click();
    await drawer.amount().fill('42');
    await drawer.submit('Save price').click();

    await freeze.expectTitle('The prices of a published version are immutable');
    await expect(freeze.detail()).toContainText('price a new version');
    await expect(freeze.createNewVersion()).toBeVisible();
  });

  test('refuses a new price on an archived version, which takes none', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    const model = createPricedCatalogModel();
    model.setNextProblem('createPrice', {
      code: 'CreateLicensePrice.VersionArchived',
      detail: 'an archived licence version takes no new price',
      status: 409,
    });
    await installLicenseAppMocks(page, model);

    // The version was archived while this page showed it as a draft.
    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.amount().fill('49');
    await drawer.submit('Create price').click();

    await freeze.expectTitle('This version takes no new price');
    await expect(freeze.detail()).toHaveText(
      'an archived licence version takes no new price',
    );
  });

  test('does not take any other refusal for a frozen version', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const drawer = new LicensePriceDrawerDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    const model = createDraftPricesModel();
    model.setNextProblem('createPrice', {
      code: 'CreateLicensePrice.DefaultConflict',
      detail: 'another price is already the default for this billing period',
      status: 409,
    });
    await installLicenseAppMocks(page, model);

    await prices.goto('pro-v4', 'Pro');
    await prices.addPrice().click();
    await drawer.amount().fill('49');
    await drawer.isDefault().check();
    await drawer.submit('Create price').click();

    await expect(drawer.problem()).toContainText('another price is already');
    await expect(freeze.dialog()).toHaveCount(0);
  });
});
