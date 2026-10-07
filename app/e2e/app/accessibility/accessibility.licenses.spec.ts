import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { expectNoAccessibilityViolations } from '../_support/assertions/accessibility';
import { expectFocusTrapped } from '../_support/assertions/focus';
import { LicenseCommercialDriver } from '../_support/drivers/license-commercial.driver';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicensePreviewDriver } from '../_support/drivers/license-preview.driver';
import { LicensePriceDrawerDriver } from '../_support/drivers/license-price-drawer.driver';
import { LicensePricesDriver } from '../_support/drivers/license-prices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { createBillingStackModel } from '../billing/billing.scenarios';
import {
  createDraftPricesModel,
  createPricedCatalogModel,
} from '../licenses/licenses.scenarios';

// What a version sells, as a person meets it: the Prices tab, the card of its
// commercial terms, and every dialog that opens over them. Each dialog must be
// free of violations, keep the focus inside while it is open, and close on
// Escape.

/** A dialog that is open: no violation on the page, the focus held, closed by Escape. */
async function expectDialogAccessible(page: Page, dialog: Locator) {
  await expectNoAccessibilityViolations(page);
  await expectFocusTrapped(page, dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}

/**
 * Switches the console to the light theme. It starts dark, and the tokens of the
 * other theme are the ones under the root class that is left off. Elements
 * transition their colors, which axe would read half-way: it waits for them.
 */
async function useLightTheme(page: Page) {
  await page.evaluate(async () => {
    document.documentElement.classList.remove('dark');
    // Only the transitions: an animation that loops, a spinner, never finishes.
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

test.describe('accessibility of what a license version sells', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
  });

  test('the Prices tab has no WCAG A/AA violations', async ({ page }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await prices.expectLabels([
      'Pro, monthly',
      'Pro, annual',
      'Traces, overage',
    ]);

    await expectNoAccessibilityViolations(page);
  });

  test('the Prices tab has none in the light theme either, where the muted text is another color', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await prices.expectLabels([
      'Pro, monthly',
      'Pro, annual',
      'Traces, overage',
    ]);
    await useLightTheme(page);

    await expectNoAccessibilityViolations(page);
  });

  test('the drawer of a new price has none in the light theme either', async ({
    page,
  }) => {
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await page.goto('/licenses/pro-v4/prices?price=new');
    await drawer.expectOpen('New price');
    await drawer.chooseModel('Overage');
    await expect(drawer.picker()).toBeVisible();
    await useLightTheme(page);

    await expectNoAccessibilityViolations(page);
  });

  test('the Prices tab of a version with no price has none either', async ({
    page,
  }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v4', 'Pro');
    await expect(
      page.getByText('This version has no price yet.'),
    ).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });

  test('the overview, with its commercial terms, has no WCAG A/AA violations', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await detail.goto('pro-v4', 'Pro');
    await expect(commercial.card()).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });

  test('the dialog of the commercial terms is accessible', async ({ page }) => {
    const detail = new LicenseDetailDriver(page);
    const commercial = new LicenseCommercialDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await detail.goto('pro-v4', 'Pro');
    await commercial.open();

    await expectDialogAccessible(page, commercial.dialog());
  });

  test('the drawer of a new price is accessible, with the picker of what it meters', async ({
    page,
  }) => {
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await page.goto('/licenses/pro-v4/prices?price=new');
    await drawer.expectOpen('New price');
    await drawer.chooseModel('Usage-based');
    // The stocks the version grants are listed, disabled, beside the flows.
    await expect(drawer.picker()).toBeVisible();
    await expect(drawer.stockHint()).toBeVisible();

    await expectDialogAccessible(page, drawer.root());
  });

  test('the drawer of an existing price is accessible', async ({ page }) => {
    const drawer = new LicensePriceDrawerDriver(page);
    await installLicenseAppMocks(page, createDraftPricesModel());

    await page.goto('/licenses/pro-v4/prices?price=price-1-base');
    await drawer.expectOpen('Edit price');
    await expect(drawer.amount()).toHaveValue('39.00');

    await expectDialogAccessible(page, drawer.root());
  });

  test('the confirmation of a deprecation is accessible', async ({ page }) => {
    const prices = new LicensePricesDriver(page);
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await prices.goto('pro-v2', 'Pro');
    await prices.deprecate('Traces, overage').click();
    await expect(prices.deprecateDialog()).toBeVisible();

    await expectDialogAccessible(page, prices.deprecateDialog());
  });

  test('the preview of an invoice is accessible, with the invoice it composed', async ({
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

    await expectDialogAccessible(page, preview.dialog());
  });
});
