import {
  expect,
  expectToast,
  recordWrites,
  test,
  type RecordedWrite,
} from '../_support/app-test';
import { expectNoToast } from '../_support/assertions/toast';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicenseFreezeDriver } from '../_support/drivers/license-freeze.driver';
import { LicensePriceDrawerDriver } from '../_support/drivers/license-price-drawer.driver';
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
  createDraftPricesModel,
  createPricedCatalogModel,
} from './licenses.scenarios';

// What a version sells cannot change once a live subscription bills it, and the
// prices of a published version are immutable. The API refuses with a code for
// each, and every refusal has the same answer: a new version, which starts from
// this one with its entitlements and its prices. The console shows the refusal
// as a dialog that says what the API said and offers it, never as a toast.

const LICENSE_WRITES = /^\/api\/licenses(\/|$)/;
const BILLED_SLUG = 'pro-v2';

const writesTo = (writes: RecordedWrite[], pathname: RegExp) =>
  writes.filter((write) => pathname.test(write.pathname));

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
      '/licenses/versions/pro-v2?draft=true',
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
    await expect(page).toHaveURL('/licenses/pro-v2');
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
    await expect(page).toHaveURL('/licenses/versions/pro-v2?draft=true');
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
    await expect(page).toHaveURL('/licenses/pro-v5/prices');
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

    await page.goto('/licenses/versions/pro-v2?draft=true');
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
    await expect(page).toHaveURL('/licenses');
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

    await page.goto('/licenses/versions/pro-v2?draft=true');
    await form.expectLoaded('Pro');
    await form.submit();

    // The version exists, as a draft, with the price that went through; its
    // prices are where the rest of the copy is offered.
    await expectToast(
      page,
      'Saved as a draft, not published: an overage price needs a grant whose overage can be reached',
    );
    await expect(page).toHaveURL('/licenses/pro-v5/prices?copyFrom=pro-v2');
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

    writes.length = 0;
    await banner.getByRole('button', { name: 'Resume the copy' }).click();

    await expectToast(page, 'Prices copied');
    await expect(banner).toHaveCount(0);
    await expect(page).toHaveURL('/licenses/pro-v5/prices');
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

    await page.goto('/licenses/versions/pro-v2');
    await form.expectLoaded('Pro');
    // The prices are billing's: there is nothing to offer to copy.
    await expect(form.copyPrices()).toHaveCount(0);
    await form.submit();

    await expect(page).toHaveURL('/licenses');
    expect(writesTo(writes, /\/prices/)).toEqual([]);
    expect(requests).toEqual([]);
  });
});
