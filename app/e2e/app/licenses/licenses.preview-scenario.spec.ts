import { expect, recordWrites, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { LicensePreviewDriver } from '../_support/drivers/license-preview.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { startInLanguage } from '../_support/language';
import { signInWithScopes } from '../_support/session-scopes';
import { createVouchersLicensesModel } from '../vouchers/vouchers.scenarios';
import { installPreviewWorld } from './licenses.preview-world';

// What a preview can be given beyond a sample of usage: the usage of an instance, the add-ons
// of a subscription, and the code of a voucher. The API composes the invoice from them, and
// refuses what it cannot, in its words. The world is the one of the vouchers (licenses.preview-world):
// Pro at $99.00 a month, Extra seats and Extra tokens to add to it, Initech Production, which
// reported 115,000 tokens since its period began, and the vouchers in every state.

const PREVIEWS = /^\/api\/licenses\/pro\/invoice-preview$/;

test.describe('the invoice preview of a version, with an instance, add-ons and a code', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
  });

  test('prices in the fee of an add-on, in the units listed', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installPreviewWorld(page);
    const writes = recordWrites(page, PREVIEWS);

    await prices.goto('pro', 'Pro');
    await preview.open();
    await preview.addAddOn();
    await preview.chooseAddOn(0, 'Extra seats · 2026', 2);
    await preview.run().click();

    await expect(preview.lines()).toHaveCount(2);
    await expect(preview.lines().nth(0)).toContainText('Pro, monthly');
    await expect(preview.lines().nth(0)).toContainText('$99.00');
    const seats = preview.lines().nth(1);
    await expect(seats).toContainText('Extra seat, monthly');
    await expect(seats).toContainText('Add-on');
    await expect(seats).toContainText('2 × 10.00 USD');
    await expect(seats).toContainText('$20.00');
    // An add-on of a preview is attached to no instance: its line says so, and only that.
    await expect(seats.getByTestId('invoice-line-addon')).toHaveCount(0);
    await expect(preview.totals()).toContainText('$119.00');
    expect(writes.map(({ body }) => body)).toEqual([
      { addOns: [{ addonSlug: 'extra-seats-v1', quantity: 2 }] },
    ]);
  });

  test('rates a sample of what an add-on meters against the limit the version and the add-on grant together', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installPreviewWorld(page);
    const writes = recordWrites(page, PREVIEWS);

    await prices.goto('pro', 'Pro');
    await preview.open();
    // Nothing of the version meters the tokens: there is no sample until an add-on does.
    await expect(preview.sampleUsage()).toHaveCount(0);
    await preview.addAddOn();
    await preview.chooseAddOn(0, 'Extra tokens · 2026');
    await expect(preview.sampleUsage()).toContainText(
      'Summed, resets every month',
    );
    await preview.sample('Tokens').fill('150000');
    await preview.run().click();

    // 100,000 and 10,000 more, accepted up to a fifth above that: 132,000 at a tenth of a cent.
    const usage = preview.lines().filter({ hasText: 'Tokens, metered' });
    await expect(usage).toContainText('Capped');
    await expect(usage).toContainText('$132.00');
    await expect(usage).toContainText('From an add-on');
    expect(writes.map(({ body }) => body)).toEqual([
      {
        addOns: [{ addonSlug: 'extra-tokens-v1', quantity: 1 }],
        sampleUsage: [{ entitlementSlug: 'tokens', quantity: '150000' }],
      },
    ]);
  });

  test('rates the usage an instance made, and sends the instance and no sample', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installPreviewWorld(page);
    const writes = recordWrites(page, PREVIEWS);

    await prices.goto('pro', 'Pro');
    await preview.open();
    await preview.addAddOn();
    await preview.chooseAddOn(0, 'Extra tokens · 2026');
    await preview.sample('Tokens').fill('5');
    await preview.source('An instance').click();
    // One or the other: the fields of the samples are gone, and the one that was typed is not sent.
    await expect(preview.sampleUsage()).toHaveCount(0);
    await expect(preview.run()).toHaveAttribute('aria-disabled', 'true');
    await preview.chooseInstance('Initech Production (initech-prod)');
    await preview.run().click();

    // Since September 15th, when its period began: 110,000 and 5,000 tokens.
    const usage = preview.lines().filter({ hasText: 'Tokens, metered' });
    await expect(usage).toContainText(
      'Sep 15, 2026, 12:00 AM – Oct 7, 2026, 12:00 PM (UTC)',
    );
    await expect(usage).toContainText('$115.00');
    expect(writes.map(({ body }) => body)).toEqual([
      {
        addOns: [{ addonSlug: 'extra-tokens-v1', quantity: 1 }],
        instanceSlug: 'initech-prod',
      },
    ]);
  });

  test('applies the discount of a code, normalized as the API does, and keeps the code out of the address and the storage', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installPreviewWorld(page);
    const writes = recordWrites(page, PREVIEWS);

    await prices.goto('pro', 'Pro');
    await preview.open();
    await preview.voucher().fill('welcome-spring-2027');
    await preview.run().click();

    const discount = preview.lines().filter({ hasText: 'Welcome spring' });
    await expect(discount).toContainText('Discount');
    await expect(discount).toContainText('−$19.80');
    await expect(preview.totals()).toContainText('$79.20');
    expect(writes.map(({ body }) => body)).toEqual([
      { voucherCode: 'welcome-spring-2027' },
    ]);
    // The code is in the body of the call, and nowhere the browser keeps.
    expect(page.url()).not.toMatch(/welcome/i);
    expect(await readConsoleStorage(page)).not.toMatch(/welcome/i);
  });

  test('shows the refusal of a code on the code', async ({ page }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installPreviewWorld(page);

    await prices.goto('pro', 'Pro');
    await preview.open();
    await preview.voucher().fill('NO-SUCH-CODE');
    await preview.run().click();
    await expect(preview.fieldError('voucherCode')).toContainText(
      'no voucher has this code',
    );
    await expect(preview.problem()).toHaveCount(0);

    // A draft has no discount to give; so has a boost.
    await preview.voucher().fill('SUMMER-SALE-2027');
    await preview.run().click();
    await expect(preview.fieldError('voucherCode')).toContainText(
      'not an ACTIVE PRICE voucher',
    );
    await preview.voucher().fill('LAUNCH-BOOST-50K');
    await preview.run().click();
    await expect(preview.fieldError('voucherCode')).toContainText(
      'not an ACTIVE PRICE voucher',
    );
  });

  test('shows what the API refuses of the add-ons under their list', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    // The refusal is armed before the page starts: it holds the model the mocks are made of.
    const licenses = createVouchersLicensesModel();
    licenses.setNextProblem('previewInvoice', {
      code: 'PreviewLicenseInvoice.InvalidAddOns',
      detail: 'add-on "extra-seats-v1" is listed twice',
      status: 422,
    });
    await installPreviewWorld(page, { licenses });

    await prices.goto('pro', 'Pro');
    await preview.open();
    await preview.addAddOn();
    await preview.chooseAddOn(0, 'Extra seats · 2026');
    await preview.run().click();

    await expect(preview.fieldError('addOns')).toContainText(
      'add-on "extra-seats-v1" is listed twice',
    );
    // It is about the list, so it is not repeated under the form.
    await expect(preview.problem()).toHaveCount(0);
  });

  test('shows an instance the API does not know on the instance', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    const licenses = createVouchersLicensesModel();
    licenses.setNextProblem('previewInvoice', {
      code: 'PreviewLicenseInvoice.InstanceNotFound',
      detail: 'instance "initech-prod" not found',
      status: 404,
    });
    await installPreviewWorld(page, { licenses });

    await prices.goto('pro', 'Pro');
    await preview.open();
    await preview.source('An instance').click();
    await preview.chooseInstance('Initech Production (initech-prod)');
    await preview.run().click();

    await expect(preview.fieldError('instanceSlug')).toContainText(
      'instance "initech-prod" not found',
    );
    await expect(preview.problem()).toHaveCount(0);
  });

  test('says where the usage that is kept begins when the period of the instance began before it', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installPreviewWorld(page, {
      retentionStart: '2026-10-01T00:00:00.000Z',
    });

    await prices.goto('pro', 'Pro');
    await preview.open();
    // The tokens are metered by the price of the add-on, so there is usage to read.
    await preview.addAddOn();
    await preview.chooseAddOn(0, 'Extra tokens · 2026');
    await preview.source('An instance').click();
    await preview.chooseInstance('Initech Production (initech-prod)');
    await preview.run().click();

    await expect(preview.fieldError('instanceSlug')).toContainText(
      'The usage before Oct 1, 2026 (UTC) is no longer kept, and the period of this instance began earlier.',
    );
  });

  test('reads no history of an invoice that meters nothing, so the period of the instance is not refused', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installPreviewWorld(page, {
      retentionStart: '2026-10-01T00:00:00.000Z',
    });

    await prices.goto('pro', 'Pro');
    await preview.open();
    await preview.source('An instance').click();
    await preview.chooseInstance('Initech Production (initech-prod)');
    await preview.run().click();

    await expect(preview.lines()).toHaveCount(1);
    await expect(preview.fieldError('instanceSlug')).not.toContainText(
      'no longer kept',
    );
  });

  test('offers none of it to a session that may not list the instances nor read the add-ons', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await signInWithScopes(page, ['read:billing', 'read:licenses']);
    await installPreviewWorld(page);
    const reads = recordWrites(page, /^\/api\/(addons|instances)$/, ['GET']);

    await prices.goto('pro', 'Pro');
    await preview.open();
    await preview.run().click();

    await expect(preview.lines()).toHaveCount(1);
    await expect(preview.usage()).toHaveCount(0);
    await expect(preview.dialog().getByText('Add-ons')).toHaveCount(0);
    // Nothing was asked of the API that it would refuse.
    expect(reads).toEqual([]);
  });

  test('reads the new fields in French', async ({ page }) => {
    const prices = new LicensePricesDriver(page);
    await startInLanguage(page, 'fr');
    await installPreviewWorld(page);

    await page.goto('/catalog/licenses/pro/prices');
    await page
      .getByRole('button', { name: 'Aperçu de facture', exact: true })
      .click();
    const dialog = page.getByRole('dialog');

    await expect(
      dialog.getByRole('group', { name: 'Usage', exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: /^Une instance/ }),
    ).toBeVisible();
    await expect(dialog.getByText('Add-ons', { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Ajouter un add-on' }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel('Code promo', { exact: true }),
    ).toBeVisible();
    void prices;
  });
});
