import { expect, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  createBillingDisabledModel,
  createBillingFeatureGatedModel,
  createBillingFullModel,
  createBillingStackModel,
} from './billing.scenarios';

// The Billing section of the side navigation follows what the capabilities say:
// it is there where billing is on, and entry by entry for what the release
// ships. Where it is not there, a link to a billing page explains why: see
// `billing.unavailable.spec.ts`.

test.describe('the Billing section of the navigation', () => {
  test('is left out where billing is off on the deployment', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await nav.gotoShell();

    await nav.expectNoSection();
  });

  test('is left out where the plan does not include billing', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('NOT_ENTITLED'),
    );

    await nav.gotoShell();

    await nav.expectNoSection();
  });

  test('lists the invoices and the handoff queue where billing is on, and nothing more', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Handoff']);
    await expect(nav.entry('Add-ons')).toHaveCount(0);
    await expect(nav.entry('Vouchers')).toHaveCount(0);
  });

  test('hides the entries of the parts the release does not ship', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingFeatureGatedModel());

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Handoff']);
    await expect(nav.entry('Add-ons')).toHaveCount(0);
    await expect(nav.entry('Vouchers')).toHaveCount(0);
  });

  test('lists every entry when every part is shipped', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingFullModel());

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Handoff', 'Add-ons', 'Vouchers']);
    await expect(nav.entry('Invoices')).toHaveAttribute(
      'href',
      '/billing/invoices',
    );
    await expect(nav.entry('Add-ons')).toHaveAttribute('href', '/addons');
  });

  test('opens by itself on a billing page', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await page.goto('/billing/invoices');

    await expect(nav.section()).toHaveAttribute('aria-expanded', 'true');
    await nav.expectEntries(['Invoices', 'Handoff']);
    // Billing is on, so no explanation stands in for the page.
    await expect(nav.unavailable()).toHaveCount(0);
  });
});
