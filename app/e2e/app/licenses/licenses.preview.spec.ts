import { expect, recordWrites, test } from '../_support/app-test';
import { LicensePreviewDriver } from '../_support/drivers/license-preview.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingStackModel } from '../billing/billing.scenarios';
import {
  createDraftPricesModel,
  createPricedCatalogModel,
  createTwoFlatFeesModel,
} from './licenses.scenarios';

// The invoice a version would bill, composed by the API from a base price and a
// sample usage and shown as it came: its lines with their service periods and
// arithmetic, and its totals. It is a preview, not an invoice, and it writes
// nothing.

const PREVIEWS = /^\/api\/licenses\/[^/]+\/invoice-preview$/;

test.describe('the invoice preview of a version', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('composes the renewal from the usage given, and shows what the API says of it', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, PREVIEWS);

    await prices.goto('pro-v2', 'Pro');
    await preview.open();

    // What it is: a preview, with no way to save anything.
    await expect(preview.banner()).toContainText('Preview, not an invoice');
    await expect(
      preview.dialog().getByRole('button', { name: /save/i }),
    ).toHaveCount(0);
    // Nothing is asked of the API before the person asks for it.
    await expect(preview.result()).toHaveCount(0);
    expect(writes).toEqual([]);

    // The only metered price of the version is an overage on traces: that is the
    // usage to give.
    await expect(preview.sampleUsage()).toContainText(
      'Bills above 100,000 traces/month, up to 200,000',
    );
    await preview.sample('Traces').fill('172345');
    await preview.run().click();

    await expect(preview.result()).toBeVisible();
    await expect(preview.lines()).toHaveCount(2);
    // In the order of the API: by the period each line bills, so the usage of the
    // period that ends comes before the base of the period that starts.
    const overage = preview.lines().nth(0);
    await expect(overage).toContainText('Traces, overage');
    await expect(overage).toContainText('Overage');
    // The arithmetic of the API, as it wrote it.
    await expect(overage).toContainText(
      '0.72345 × 8.00 USD (per 100,000 traces); 172,345 used; 72,345 above the applied limit (100,000)',
    );
    await expect(overage).toContainText('$5.79');
    const base = preview.lines().nth(1);
    await expect(base).toContainText('Pro, monthly');
    await expect(base).toContainText('Base');
    await expect(base).toContainText('$29.00');
    // The totals are the API's: nothing is added up in the page.
    await expect(preview.totals()).toContainText('$34.79');
    expect(writes).toEqual([
      {
        body: {
          sampleUsage: [{ entitlementSlug: 'traces', quantity: '172345' }],
        },
        method: 'POST',
        pathname: '/api/licenses/pro-v2/invoice-preview',
      },
    ]);
  });

  test('says when it is composed from, and for which period each line bills', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    await preview.sample('Traces').fill('172345');
    await preview.run().click();

    await expect(preview.result()).toContainText('Renewal invoice, composed');
    // The base bills the period that starts at the boundary, the usage the one
    // that ends there: two periods, one boundary, in UTC.
    const periods = await preview
      .lines()
      .locator('td')
      .filter({ hasText: /\(UTC\)/ })
      .allInnerTexts();
    expect(periods).toHaveLength(2);
    expect(periods[0]).not.toBe(periods[1]);
    for (const period of periods) {
      expect(period).toMatch(/–/);
    }
  });

  test('previews the base alone when no usage is given, and sends no usage', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, PREVIEWS);

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    await preview.run().click();

    await expect(preview.lines()).toHaveCount(1);
    await expect(preview.lines().first()).toContainText('Pro, monthly');
    await expect(preview.totals()).toContainText('$29.00');
    expect(writes.map(({ body }) => body)).toEqual([{}]);
  });

  test('produces no overage line while the usage stays within what the version grants', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    await preview.sample('Traces').fill('50000');
    await preview.run().click();

    await expect(preview.lines()).toHaveCount(1);
    await expect(preview.result()).not.toContainText('Traces, overage');
    await expect(preview.totals()).toContainText('$29.00');
  });

  test('marks the line of a usage above what the version accepts as capped, as the API says', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    // 300,000 traces against 100,000 and a cap of 200,000.
    await preview.sample('Traces').fill('300000');
    await preview.run().click();

    const overage = preview.lines().nth(0);
    await expect(overage.getByText('Capped', { exact: true })).toBeVisible();
    await expect(overage).toContainText(
      'sample capped at what the licence accepts',
    );
    // Rated at the cap, 100,000 above the limit: 1 × $8.00.
    await expect(overage).toContainText('$8.00');
    await expect(preview.totals()).toContainText('$37.00');
  });

  test('runs again with other usage, and the new invoice replaces the old one', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    await preview.sample('Traces').fill('172345');
    await preview.run().click();
    await expect(preview.totals()).toContainText('$34.79');

    await preview.sample('Traces').fill('200000');
    await preview.run().click();

    await expect(preview.totals()).toContainText('$37.00');
    await expect(preview.totals()).not.toContainText('$34.79');
  });

  test('refuses a quantity that is not one, before anything is sent', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, PREVIEWS);

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    // A comma is read by a person as a thousand separator and by a decimal as a
    // fraction: it is refused, not guessed.
    await preview.sample('Traces').fill('172,345');
    await preview.sample('Traces').blur();

    await expect(
      preview.dialog().getByText(/Enter a quantity: zero or more/),
    ).toBeVisible();
    await expect(preview.run()).toBeDisabled();
    expect(writes).toEqual([]);

    await preview.sample('Traces').fill('172345');
    await expect(preview.run()).toBeEnabled();
  });

  test('shows the refusal of the sample on the usage, and keeps the dialog open', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    const model = createPricedCatalogModel();
    model.setNextProblem('previewInvoice', {
      code: 'PreviewLicenseInvoice.InvalidSampleUsage',
      detail: 'no active price of this version meters traces',
      status: 422,
    });
    await installLicenseAppMocks(page, model);

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    await preview.sample('Traces').fill('172345');
    await preview.run().click();

    await expect(preview.sampleError()).toHaveText(
      'no active price of this version meters traces',
    );
    await expect(preview.result()).toHaveCount(0);
    await expect(preview.dialog()).toBeVisible();

    // The refusal was the one armed: asking again composes the invoice, and the
    // refusal is gone.
    await preview.run().click();
    await expect(preview.totals()).toContainText('$34.79');
    await expect(preview.sampleError()).toHaveCount(0);
  });

  test('shows any other refusal under the form, with what the API says', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    const model = createPricedCatalogModel();
    model.setNextProblem('previewInvoice', {
      code: 'PreviewLicenseInvoice.NoBasePrice',
      detail:
        'this version has no default FLAT_FEE price: name one with basePriceId',
      status: 422,
    });
    await installLicenseAppMocks(page, model);

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    await preview.run().click();

    await expect(preview.problem()).toContainText(
      'this version has no default FLAT_FEE price',
    );
    await expect(preview.result()).toHaveCount(0);
    await expect(preview.sampleError()).toHaveCount(0);
  });

  test('asks which flat fee to start from when the version has several, and names it when it is not the default', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createTwoFlatFeesModel());
    const writes = recordWrites(page, PREVIEWS);

    await prices.goto('pro-v4', 'Pro');
    await preview.open();

    // The default is picked, and said to be the default.
    await expect(preview.base()).toContainText('Pro, monthly');
    await expect(preview.base()).toContainText('Default');
    await preview.run().click();
    await expect(preview.lines()).toHaveCount(1);
    await expect(preview.totals()).toContainText('$39.00');

    await preview.chooseBase(/Pro, annual/);
    await preview.run().click();

    await expect(preview.totals()).toContainText('$390.00');
    expect(writes.map(({ body }) => body)).toEqual([
      {},
      { basePriceId: 'price-2-annual' },
    ]);
  });

  test('works on a draft, which is how a price is checked before it goes on sale', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createDraftPricesModel());

    await prices.goto('pro-v4', 'Pro');
    await preview.open();
    // The draft meters requests, rated per 1k: that is the usage to give.
    await expect(preview.sampleUsage()).toContainText('Requests');
    await preview.sample('Requests').fill('500');
    await preview.run().click();

    await expect(preview.lines()).toHaveCount(2);
    // Half a sale unit of 1k at $1.50, and the base of $39.00.
    await expect(preview.result()).toContainText(
      '0.5 × 1.50 USD (per 1k requests)',
    );
    await expect(preview.totals()).toContainText('$39.75');
  });

  test('closes without a trace, and starts clean the next time', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await preview.open();
    await preview.sample('Traces').fill('172345');
    await preview.run().click();
    await expect(preview.result()).toBeVisible();
    await preview.close();

    await preview.open();
    await expect(preview.result()).toHaveCount(0);
    await expect(preview.sample('Traces')).toHaveValue('');
  });

  test('gives no usage to enter once the metered price is deprecated, which rates nothing any more', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await prices.deprecate('Traces, overage').click();
    await prices.confirmDeprecation();
    await expect(prices.status('Traces, overage')).toHaveText('Deprecated');

    await preview.open();

    await expect(preview.sampleUsage()).toHaveCount(0);
    await preview.run().click();
    await expect(preview.lines()).toHaveCount(1);
    await expect(preview.totals()).toContainText('$29.00');
  });
});

test.describe('where the preview cannot run', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('is offered, disabled with the reason, on a version with no flat fee', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const preview = new LicensePreviewDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    // The draft has no price at all: an invoice has nothing to start from.
    await prices.goto('pro-v4', 'Pro');

    await expect(preview.openButton()).toBeDisabled();
    await preview.openButton().locator('..').hover();
    await expect(page.getByRole('tooltip')).toContainText(
      'Add an active flat fee first',
    );
  });
});
