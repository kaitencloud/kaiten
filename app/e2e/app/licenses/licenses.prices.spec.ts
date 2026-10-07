import { expect, test } from '../_support/app-test';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createBillingDisabledModel,
  createBillingStackModel,
} from '../billing/billing.scenarios';
import { createPricedCatalogModel } from './licenses.scenarios';

// The Prices tab of a license version: what a version bills, as the API lists
// it. It exists only where billing does.

test.describe('the Prices tab', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createPricedCatalogModel());
  });

  test('lists the prices in display order, each as the API describes it', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);

    await prices.goto('pro-v2', 'Pro');

    // Display order, then id: the deprecated annual price shares an order with the
    // base and sorts after it.
    await prices.expectLabels([
      'Pro, monthly',
      'Pro, annual',
      'Traces, overage',
    ]);

    const base = prices.row('Pro, monthly');
    await expect(base.getByText('Default')).toBeVisible();
    await expect(base.getByText('Flat fee')).toBeVisible();
    await expect(base.getByText('$29.00')).toBeVisible();
    await expect(base.getByText('Monthly · In advance')).toBeVisible();

    const annual = prices.row('Pro, annual');
    await expect(annual.getByText('Deprecated', { exact: true })).toBeVisible();
    await expect(
      annual.getByText('Deprecated Feb 20, 2026 (UTC)'),
    ).toBeVisible();
    await expect(annual.getByText('Default')).toHaveCount(0);

    const overage = prices.row('Traces, overage');
    await expect(overage.getByText('Overage', { exact: true })).toBeVisible();
    await expect(overage.getByText('$8.00')).toBeVisible();
    await expect(overage.getByText('per 100,000 traces')).toBeVisible();
    await expect(overage.getByText('In arrears')).toBeVisible();
    // What the overage bills against: the allowance and the cap it can reach.
    await expect(
      overage.getByText('Bills above 100,000 traces/month, up to 200,000'),
    ).toBeVisible();
  });

  test('says what the version bills in one line, and adds nothing up', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);

    await prices.goto('pro-v2', 'Pro');

    // The deprecated annual price is no longer offered, and a price per unit has
    // no total to sum it into.
    await expect(prices.summary()).toHaveText(
      '$29.00/month + $8.00 per 100,000 traces above the allowance',
    );
  });

  test('says so when a version has no price yet', async ({ page }) => {
    const prices = new LicensePricesDriver(page);

    await prices.goto('pro-v4', 'Pro');

    await expect(
      page.getByText('This version has no price yet.'),
    ).toBeVisible();
    await expect(prices.summary()).toHaveText('No active price yet');
  });

  test('says what the state of the version means for its prices', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);

    await prices.goto('pro-v4', 'Pro');
    await expect(
      page.getByText(/The prices of a draft can be edited/),
    ).toBeVisible();

    await prices.goto('pro-v2', 'Pro');
    await expect(
      page.getByText(/The prices of a published version are immutable/),
    ).toBeVisible();

    await prices.goto('pro', 'Pro');
    await expect(
      page.getByText(/This version is withdrawn from sale/),
    ).toBeVisible();
  });

  test('is a tab beside the overview, which keeps working', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const prices = new LicensePricesDriver(page);

    await detail.goto('pro-v2', 'Pro');
    await expect(prices.tab('Overview')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await prices.tab('Prices').click();
    await expect(page).toHaveURL('/licenses/pro-v2/prices');
    await expect(prices.tab('Prices')).toHaveAttribute('aria-selected', 'true');
    await expect(prices.summary()).toBeVisible();

    await prices.tab('Overview').click();
    await expect(page).toHaveURL('/licenses/pro-v2');
    await detail.expectState('Published');
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

  test('offers no Prices tab, and the version opens as it always did', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const prices = new LicensePricesDriver(page);

    await detail.goto('pro-v2', 'Pro');

    await detail.expectState('Published');
    // With nothing but its overview the version has no bar of tabs, as it had
    // none before it had a second one.
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(prices.tab('Prices')).toHaveCount(0);
  });

  test('explains on a deep link, and asks the API for nothing of billing but its capabilities', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (/^\/api\/licenses\/[^/]+\/(prices|invoice-preview)/.test(pathname)) {
        requests.push(`${request.method()} ${pathname}`);
      }
    });

    await page.goto('/licenses/pro-v2/prices');

    await expect(page.getByTestId('billing-unavailable')).toHaveAttribute(
      'data-reason',
      'DEPLOYMENT_DISABLED',
    );
    await expect(page.getByText(/KAITEN_BILLING_ENABLED/)).toBeVisible();
    // The page of the version is there around the explanation, and an
    // explanation is not an error.
    await expect(
      page.getByRole('heading', { name: 'Pro', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Page not found')).toHaveCount(0);
    expect(requests).toEqual([]);
  });
});
