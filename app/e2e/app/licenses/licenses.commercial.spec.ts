import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { LicenseCommercialDriver } from '../_support/drivers/license-commercial.driver';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createBillingDisabledModel,
  createBillingStackModel,
} from '../billing/billing.scenarios';
import { createPricedCatalogModel } from './licenses.scenarios';

// How a version is sold, beside what it grants: its pricing type, the trial a
// subscription starts with, whether sign-up captures a payment method, and where
// a buyer is sent when the version cannot be bought self-serve. They are fields
// of the version, edited with the same update the rest of it is, and they are
// billing's: where billing is not there, there is nothing to show or to edit.

const LICENSE_WRITES = /^\/api\/licenses\/[^/]+$/;

test.describe('the commercial terms of a version', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('are shown on the overview of the version, as the API has them', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await detail.goto('pro-v4', 'Pro');

    await expect(commercial.card()).toContainText('Commercial terms');
    await expect(commercial.field('Pricing type')).toContainText('Paid');
    await expect(commercial.field('Free trial')).toContainText('14 days');
    await expect(commercial.field('Payment method')).toContainText(
      'Not required',
    );
    // No call-to-action URL was ever set.
    await expect(commercial.field('Call-to-action URL')).toContainText('-');
  });

  test('are edited from the card, in a dialog the URL opens, and shown once saved', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, LICENSE_WRITES);

    await detail.goto('pro-v4', 'Pro');
    await commercial.open();
    await expect(page).toHaveURL('/catalog/licenses/pro-v4?mode=configure');

    // The terms as they are.
    await expect(commercial.pricingType()).toContainText('Paid');
    await expect(commercial.trial()).toHaveValue('14');
    await expect(commercial.paymentMethod()).not.toBeChecked();
    await expect(commercial.ctaUrl()).toHaveValue('');
    // Nothing to save until something changes.
    await expect(commercial.save()).toBeDisabled();

    await commercial.choosePricingType('Custom');
    await commercial.trial().fill('30');
    await commercial.paymentMethod().check();
    await commercial.ctaUrl().fill('https://acme.test/contact');
    await commercial.save().click();

    await expectToast(page, 'Commercial terms updated');
    await expect(commercial.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/catalog/licenses/pro-v4');
    await expect(commercial.field('Pricing type')).toContainText('Custom');
    await expect(commercial.field('Free trial')).toContainText('30 days');
    await expect(commercial.field('Payment method')).toContainText(
      'Captured at sign-up',
    );
    await expect(
      commercial.field('Call-to-action URL').getByRole('link'),
    ).toHaveAttribute('href', 'https://acme.test/contact');
    // The update restates the version, which the API requires, and carries the
    // commercial fields.
    expect(writes).toEqual([
      {
        body: {
          description: 'Pro plan, Pro 2027',
          isDefault: false,
          name: 'Pro',
          pricingType: 'CUSTOM',
          requiresPaymentMethod: true,
          selfServeCtaUrl: 'https://acme.test/contact',
          trialPeriodDays: 30,
          type: 'PAID',
          versionName: 'Pro 2027',
        },
        method: 'PUT',
        pathname: '/api/licenses/pro-v4',
      },
    ]);
  });

  test('refuse a trial of less than a day and a URL that is not one, on the field, before anything is sent', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, LICENSE_WRITES);

    await detail.goto('pro-v4', 'Pro');
    await commercial.open();

    await commercial.trial().fill('0');
    await commercial.trial().blur();
    await expect(
      commercial.dialog().getByText('Must be at least 1'),
    ).toBeVisible();
    await expect(commercial.save()).toBeDisabled();

    await commercial.trial().fill('14');
    await commercial.ctaUrl().fill('ftp://x');
    await commercial.ctaUrl().blur();
    await expect(
      commercial.dialog().getByText('Enter an http or https URL'),
    ).toBeVisible();
    await expect(commercial.save()).toBeDisabled();

    await commercial.ctaUrl().fill(`https://${'a'.repeat(2041)}`);
    await commercial.ctaUrl().blur();
    await expect(
      commercial.dialog().getByText('At most 2,048 characters'),
    ).toBeVisible();
    await expect(commercial.save()).toBeDisabled();

    // A valid URL, and the form goes through.
    await commercial.ctaUrl().fill('https://acme.test/contact');
    await commercial.paymentMethod().check();
    await expect(commercial.save()).toBeEnabled();
    expect(writes).toEqual([]);
    await commercial.save().click();

    await expectToast(page, 'Commercial terms updated');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({
      pricingType: 'PAID',
      requiresPaymentMethod: true,
      selfServeCtaUrl: 'https://acme.test/contact',
      trialPeriodDays: 14,
    });
  });

  test('clear a trial with 0 and a call-to-action URL with the empty string, which is how the API empties them', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    const model = createPricedCatalogModel();
    await installLicenseAppMocks(page, model);
    const writes = recordWrites(page, LICENSE_WRITES);

    // A version with a trial and a URL first, so that there is something to clear.
    await detail.goto('pro-v4', 'Pro');
    await commercial.open();
    await commercial.ctaUrl().fill('https://acme.test/contact');
    await commercial.save().click();
    await expectToast(page, 'Commercial terms updated');
    await expect(commercial.field('Call-to-action URL')).toContainText(
      'https://acme.test/contact',
    );

    await commercial.open();
    await commercial.trial().fill('');
    await commercial.ctaUrl().fill('');
    await commercial.save().click();

    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].body).toMatchObject({
      selfServeCtaUrl: '',
      trialPeriodDays: 0,
    });
    await expect(commercial.field('Free trial')).toContainText('No trial');
    await expect(commercial.field('Call-to-action URL')).toContainText('-');
    await expect(
      commercial.field('Call-to-action URL').getByRole('link'),
    ).toHaveCount(0);
  });

  test('send nothing for what a version never had and nobody typed', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, LICENSE_WRITES);

    // v2 has a trial too, but no URL: only the payment method changes.
    await detail.goto('pro-v2', 'Pro');
    await commercial.open();
    await commercial.paymentMethod().check();
    await commercial.save().click();

    await expectToast(page, 'Commercial terms updated');
    const [{ body }] = writes;
    expect(body).not.toHaveProperty('selfServeCtaUrl');
    expect(body).toMatchObject({ requiresPaymentMethod: true });
  });

  test('show the refusal of the API on the field it is about, and keep what was typed', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    const model = createPricedCatalogModel();
    model.setNextProblem('updateLicense', {
      code: 'UpdateLicense.InvalidSelfServeCtaUrl',
      detail:
        'selfServeCtaUrl must be an http(s) URL of at most 2048 characters',
      status: 422,
    });
    await installLicenseAppMocks(page, model);

    await detail.goto('pro-v4', 'Pro');
    await commercial.open();
    await commercial.ctaUrl().fill('https://acme.test/contact');
    await commercial.save().click();

    await expect(
      commercial
        .dialog()
        .getByText(
          'selfServeCtaUrl must be an http(s) URL of at most 2048 characters',
        ),
    ).toBeVisible();
    await expect(commercial.dialog()).toBeVisible();
    await expect(commercial.ctaUrl()).toHaveValue('https://acme.test/contact');
    await expect(commercial.problem()).toHaveCount(0);
  });

  test('show any other refusal above the buttons', async ({ page }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    const model = createPricedCatalogModel();
    model.setNextProblem('updateLicense', {
      code: 'UpdateLicense.NotFound',
      detail: 'license "pro-v4" was removed in the meantime',
      status: 404,
    });
    await installLicenseAppMocks(page, model);

    await detail.goto('pro-v4', 'Pro');
    await commercial.open();
    await commercial.paymentMethod().check();
    await commercial.save().click();

    await expect(commercial.problem()).toContainText(
      'license "pro-v4" was removed in the meantime',
    );
    await expect(commercial.dialog()).toBeVisible();
  });

  test('close with Cancel, and the link back to the page drops the mode', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, LICENSE_WRITES);

    await detail.goto('pro-v4', 'Pro');
    await commercial.open();
    await commercial.trial().fill('99');
    await commercial.cancel().click();

    await expect(commercial.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/catalog/licenses/pro-v4');
    await expect(commercial.field('Free trial')).toContainText('14 days');
    expect(writes).toEqual([]);
  });

  test('open from a link, and the back button closes the dialog', async ({
    page,
  }) => {
    const commercial = new LicenseCommercialDriver(page);
    const detail = new LicenseDetailDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await detail.goto('pro-v4', 'Pro');
    await commercial.open();
    await page.goBack();

    await expect(commercial.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/catalog/licenses/pro-v4');

    await page.goto('/catalog/licenses/pro-v4?mode=configure');
    await expect(commercial.dialog()).toBeVisible();
  });

  test('can be edited from the prices tab too, which keeps its own search', async ({
    page,
  }) => {
    const commercial = new LicenseCommercialDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await page.goto('/catalog/licenses/pro-v4/prices?mode=configure');

    await expect(commercial.dialog()).toBeVisible();
    await commercial.cancel().click();
    await expect(commercial.dialog()).toHaveCount(0);
    await expect(page).toHaveURL('/catalog/licenses/pro-v4/prices');
  });
});

test.describe('where billing is not there', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    await installLicenseAppMocks(page, createPricedCatalogModel());
  });

  test('show no commercial terms, and a link that would edit them opens nothing', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);

    await detail.goto('pro-v4', 'Pro');
    await expect(commercial.card()).toHaveCount(0);

    await page.goto('/catalog/licenses/pro-v4?mode=configure');
    await detail.expectState('Draft');
    await expect(commercial.dialog()).toHaveCount(0);
  });
});
