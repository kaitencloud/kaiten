import {
  expect,
  expectToast,
  recordWrites,
  test,
  type RecordedWrite,
} from '../_support/app-test';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicenseFreezeDriver } from '../_support/drivers/license-freeze.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { LicenseVersionFormDriver } from '../_support/drivers/license-version-form.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createBillingDisabledModel,
  createBillingStackModel,
} from '../billing/billing.scenarios';
import {
  createBilledCatalogModel,
  createPricedCatalogModel,
} from './licenses.scenarios';

// The answer to a version that cannot be changed any more is a new version,
// which starts from it: its entitlements, the terms it is sold on and, where
// billing is on, its active prices, one call each. The copy of prices is the
// one step that can stop halfway, and is finished from where it stopped.

const LICENSE_WRITES = /^\/api\/licenses(\/|$)/;
const BILLED_SLUG = 'pro-v2';

const writesTo = (writes: RecordedWrite[], pathname: RegExp) =>
  writes.filter((write) => pathname.test(write.pathname));

test.describe('a new version of a version that cannot be changed any more', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('creates a new version from the dialog: its entitlements, then its active prices in order, and nothing is sent to the old one', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const freeze = new LicenseFreezeDriver(page);
    const form = new LicenseVersionFormDriver(page);
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createBilledCatalogModel());
    const writes = recordWrites(page, LICENSE_WRITES);

    await detail.goto(BILLED_SLUG, 'Pro');
    await detail.editThreshold('Traces', '100,000', '150000');
    await freeze.createNewVersion().click();

    // The form starts from this version, as a draft: a draft is what can be changed.
    await expect(page).toHaveURL(
      '/catalog/licenses/versions/pro-v2?draft=true',
    );
    await form.expectLoaded('Pro');
    await expect(
      page.getByRole('checkbox', { name: 'Save as draft' }),
    ).toBeChecked();
    // The edit that was refused was not sent again.
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual(['PUT /api/licenses/pro-v2/entitlements/traces']);
    writes.length = 0;

    await form.submit();

    // The new version opens on its prices, which are the two the old one bills.
    await expect(page).toHaveURL('/catalog/licenses/pro-v5/prices');
    await prices.expectLabels(['Pro, monthly', 'Traces, overage']);
    await expect(prices.row('Pro, monthly').getByText('$29.00')).toBeVisible();
    await expect(
      prices.row('Traces, overage').getByText('$8.00'),
    ).toBeVisible();
    await expect(
      page.getByText(/The prices of a draft can be edited/),
    ).toBeVisible();

    const created = writesTo(writes, /^\/api\/licenses$/);
    expect(created).toHaveLength(1);
    expect(created[0].body).toMatchObject({
      familyId: 'family-pro',
      isDefault: false,
      lifecycleState: 'DRAFT',
      name: 'Pro',
      // How the old version is sold carries over.
      pricingType: 'PAID',
      trialPeriodDays: 14,
      type: 'PAID',
    });
    // One grant per entitlement of the old version, on the new one.
    const grants = writesTo(writes, /^\/api\/licenses\/pro-v5\/entitlements$/);
    expect(
      grants
        .map(
          ({ body }) => (body as { entitlementSlug: string }).entitlementSlug,
        )
        .sort(),
    ).toEqual(['credits', 'requests', 'seats', 'sso', 'traces']);
    // Then one price per ACTIVE price of the old version, in its display order: the
    // deprecated annual price is not offered by a new version.
    const copies = writesTo(writes, /^\/api\/licenses\/pro-v5\/prices$/);
    expect(copies.map(({ body }) => body)).toEqual([
      {
        billingModel: 'FLAT_FEE',
        billingPeriod: 'MONTHLY',
        billingTiming: 'ADVANCE',
        currency: 'USD',
        displayLabel: 'Pro, monthly',
        isDefault: true,
        unitAmountDecimal: '2900',
      },
      {
        billingModel: 'OVERAGE',
        billingTiming: 'ARREARS',
        currency: 'USD',
        displayLabel: 'Traces, overage',
        displayOrder: 1,
        meteredEntitlementSlug: 'traces',
        unitAmountDecimal: '800',
      },
    ]);
    // The grants come first: a price meters an entitlement the version must grant.
    const kinds = writes.map(({ pathname }) =>
      pathname.endsWith('/entitlements')
        ? 'grant'
        : pathname.endsWith('/prices')
          ? 'price'
          : 'other',
    );
    expect(kinds.lastIndexOf('grant')).toBeLessThan(kinds.indexOf('price'));
    // Nothing was sent to the version that is billed.
    expect(writesTo(writes, /^\/api\/licenses\/pro-v2(\/|$)/)).toEqual([]);
  });

  test('offers to copy the prices, says what does not move with them, and sends none when it is declined', async ({
    page,
  }) => {
    const form = new LicenseVersionFormDriver(page);
    await installLicenseAppMocks(page, createBilledCatalogModel());
    const writes = recordWrites(page, LICENSE_WRITES);
    const reads: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/licenses/pro-v2/prices')) {
        reads.push(`${request.method()} ${pathname}`);
      }
    });

    await page.goto('/catalog/licenses/versions/pro-v2?draft=true');
    await form.expectLoaded('Pro');

    await expect(form.copyPrices()).toBeChecked();
    await expect(
      page.getByText(
        'Subscriptions stay on their version until each one is scheduled onto the new one.',
      ),
    ).toBeVisible();
    await form.copyPrices().uncheck();
    await form.submit();

    // The version has its entitlements and no price, and opens as any other
    // version does: what the person declined is not even read.
    await expect(page).toHaveURL('/catalog/licenses');
    expect(writesTo(writes, /^\/api\/licenses$/)).toHaveLength(1);
    expect(writesTo(writes, /\/entitlements$/).length).toBeGreaterThan(0);
    expect(writesTo(writes, /\/prices/)).toEqual([]);
    expect(reads).toEqual([]);
  });

  test('says where a copy of prices stopped, and finishes it from there', async ({
    page,
  }) => {
    const form = new LicenseVersionFormDriver(page);
    const prices = new LicensePricesDriver(page);
    const model = createBilledCatalogModel();
    // The first price goes through; the second is refused.
    model.setNextProblem('createPrice', {
      after: 1,
      code: 'CreateLicensePrice.OverageUnreachable',
      detail: 'an overage price needs a grant whose overage can be reached',
      status: 422,
    });
    await installLicenseAppMocks(page, model);
    const writes = recordWrites(page, LICENSE_WRITES);

    await page.goto('/catalog/licenses/versions/pro-v2?draft=true');
    await form.expectLoaded('Pro');
    await form.submit();

    // The version exists, as a draft, with the price that went through; its
    // prices are where the rest of the copy is offered.
    await expectToast(
      page,
      'Saved as a draft, not published: an overage price needs a grant whose overage can be reached',
    );
    await expect(page).toHaveURL(
      '/catalog/licenses/pro-v5/prices?copyFrom=pro-v2',
    );
    const banner = page
      .getByRole('alert')
      .filter({ hasText: 'The copy of prices stopped' });
    await expect(banner).toContainText('1 of 2 are in');
    await expect(banner.getByRole('list', { name: 'Copied' })).toHaveText(
      'Pro, monthly',
    );
    await expect(
      banner.getByRole('list', { name: 'Still to copy' }),
    ).toHaveText('Traces, overage');
    await expect(
      page.getByRole('row').filter({ hasText: 'Pro, monthly' }),
    ).toBeVisible();

    // What stopped a copy may be fixed elsewhere (a grant on the Overview): the
    // tabs carry it, so that coming back finds it.
    await prices.tab('Overview').click();
    await expect(page).toHaveURL('/catalog/licenses/pro-v5?copyFrom=pro-v2');
    await prices.tab('Prices').click();
    await expect(page).toHaveURL(
      '/catalog/licenses/pro-v5/prices?copyFrom=pro-v2',
    );
    await expect(banner).toBeVisible();

    writes.length = 0;
    await banner.getByRole('button', { name: 'Resume the copy' }).click();

    await expectToast(page, 'Prices copied');
    await expect(banner).toHaveCount(0);
    await expect(page).toHaveURL('/catalog/licenses/pro-v5/prices');
    await prices.expectLabels(['Pro, monthly', 'Traces, overage']);
    // Only what was left was copied, after what was there; nothing was deleted
    // and nothing was sent to the version the prices come from.
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual(['POST /api/licenses/pro-v5/prices']);
    expect(writes[0].body).toMatchObject({
      billingModel: 'OVERAGE',
      displayOrder: 1,
      meteredEntitlementSlug: 'traces',
    });
  });
});

test.describe('a new version offered from the prices of a version', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createPricedCatalogModel());
  });

  test('is there for a version that cannot change its prices, and starts a draft from it', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    const form = new LicenseVersionFormDriver(page);

    // Published: its prices are immutable.
    await prices.goto('pro-v2', 'Pro');
    await expect(prices.newVersion()).toHaveAttribute(
      'href',
      '/catalog/licenses/versions/pro-v2?draft=true',
    );
    // Archived: it takes no price at all.
    await prices.goto('pro', 'Pro');
    await expect(prices.newVersion()).toBeVisible();
    await expect(prices.addPrice()).toHaveCount(0);

    await prices.goto('pro-v2', 'Pro');
    await prices.newVersion().click();

    // The form starts from this version, as a draft, with its prices.
    await expect(page).toHaveURL(
      '/catalog/licenses/versions/pro-v2?draft=true',
    );
    await form.expectLoaded('Pro');
    await expect(
      page.getByRole('checkbox', { name: 'Save as draft' }),
    ).toBeChecked();
    await expect(form.copyPrices()).toBeChecked();
  });

  test('is not there for a draft, which is changed in place', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);

    await prices.goto('pro-v4', 'Pro');

    await expect(prices.addPrice()).toBeVisible();
    await expect(prices.newVersion()).toHaveCount(0);
  });
});

test.describe('where billing is not there', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
  });

  test('copies nothing where billing is not there', async ({ page }) => {
    const form = new LicenseVersionFormDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());
    const writes = recordWrites(page, LICENSE_WRITES);
    const requests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (/^\/api\/licenses\/[^/]+\/prices/.test(pathname)) {
        requests.push(`${request.method()} ${pathname}`);
      }
    });

    await page.goto('/catalog/licenses/versions/pro-v2');
    await form.expectLoaded('Pro');
    // The prices are billing's: there is nothing to offer to copy.
    await expect(form.copyPrices()).toHaveCount(0);
    await form.submit();

    await expect(page).toHaveURL('/catalog/licenses');
    expect(writesTo(writes, /\/prices/)).toEqual([]);
    expect(requests).toEqual([]);
  });
});
