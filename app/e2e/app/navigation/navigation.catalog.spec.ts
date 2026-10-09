import { expect, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingDisabledModel } from '../billing/billing.scenarios';
import { createEmptyEntitlementsModel } from '../entitlements/entitlements.scenarios';
import { createLicenseCatalogModel } from '../licenses/licenses.scenarios';

// The licenses and the entitlements are the catalog: one entry of the side
// navigation, with the licenses first, on every deployment. The add-ons and the
// vouchers join it where billing ships them (see `billing.navigation.spec.ts`).

// The document of lucide that draws a license, which the catalog borrows.
const LICENSE_ICON = /(^|\s)lucide-file-text(\s|$)/;

test.describe('the catalog of the navigation', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    await installLicenseAppMocks(page, createLicenseCatalogModel());
    await installEntitlementAppMocks(page, createEmptyEntitlementsModel());
  });

  test('lists the licenses and the entitlements where billing is off, and nothing of billing', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);

    await nav.gotoShell();
    await nav.open();

    await expect(nav.entry('Licenses')).toHaveAttribute(
      'href',
      '/catalog/licenses',
    );
    await expect(nav.entry('Entitlements')).toHaveAttribute(
      'href',
      '/catalog/entitlements',
    );
    await nav.expectNoBillingEntries();
  });

  test('is drawn with the icon of the license', async ({ page }) => {
    const nav = new BillingNavDriver(page);

    await nav.gotoShell();

    await expect(nav.catalogIcon()).toHaveClass(LICENSE_ICON);
  });

  test('opens by itself on a page of the catalog and marks the entry of the page', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const licenses = new LicensesListDriver(page);
    const entitlements = new EntitlementsListDriver(page);

    await licenses.goto();

    await expect(nav.catalog()).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.entry('Licenses')).toHaveAttribute('aria-current', 'page');
    await expect(nav.entry('Entitlements')).not.toHaveAttribute(
      'aria-current',
      'page',
    );

    await nav.entry('Entitlements').click();

    await expect(page).toHaveURL('/catalog/entitlements');
    await entitlements.expectLoaded();
    await expect(nav.entry('Entitlements')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('opens on the licenses at /catalog', async ({ page }) => {
    const licenses = new LicensesListDriver(page);

    await page.goto('/catalog');

    await expect(page).toHaveURL('/catalog/licenses');
    await licenses.expectLoaded();
  });

  test('puts the catalog in the breadcrumbs of its pages', async ({ page }) => {
    const licenses = new LicensesListDriver(page);
    const breadcrumbs = page.getByRole('navigation', { name: 'breadcrumb' });

    await licenses.goto();

    await expect(
      breadcrumbs.getByRole('link', { name: 'Catalog' }),
    ).toHaveAttribute('href', '/catalog');
    await expect(
      breadcrumbs.getByText('Licenses', { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Licenses · Catalog · Kaiten');
  });
});
