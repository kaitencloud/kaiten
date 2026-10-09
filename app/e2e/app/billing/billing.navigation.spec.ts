import { expect, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  createBillingDisabledModel,
  createBillingFeatureGatedModel,
  createBillingFullModel,
  createBillingStackModel,
  createInvoicesModel,
} from './billing.scenarios';

// The receipt with lines of text draws an invoice. `lucide-receipt` alone, the
// receipt with a dollar sign, is the area of billing and not an invoice's.
const RECEIPT = /(^|\s)lucide-receipt(\s|$)/;
const RECEIPT_TEXT = /(^|\s)lucide-receipt-text(\s|$)/;

// The billing entries of the side navigation follow what the capabilities say:
// the Invoices entry is there where billing is on, and the Catalog section holds
// the add-ons and the vouchers beside the licenses and the entitlements, entry by
// entry for what the release ships. Where they are not there, a link to a billing
// page explains why: see `billing.unavailable.spec.ts`.

test.describe('the billing entries of the navigation', () => {
  test('are left out where billing is off on the deployment', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await nav.gotoShell();

    await nav.expectNoBillingEntries();
  });

  test('are left out where the plan does not include billing', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('NOT_ENTITLED'),
    );

    await nav.gotoShell();

    await nav.expectNoBillingEntries();
  });

  test('list the invoices on their own, and keep the catalog to its core, where billing is on and the release ships no more', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await nav.gotoShell();

    // The invoices are an entry of the navigation, with no section to open.
    await expect(nav.entry('Invoices')).toBeVisible();
    await expect(nav.entry('Invoices')).toHaveAttribute('href', '/invoices');
    // The queue of the accounting system is a view of the invoices, not an entry.
    await expect(nav.entry('Handoff')).toHaveCount(0);
    await nav.open();
    await nav.expectEntries(['Licenses', 'Entitlements']);
    await expect(nav.entry('Add-ons')).toHaveCount(0);
    await expect(nav.entry('Vouchers')).toHaveCount(0);
  });

  test('hide the entries of the parts the release does not ship', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingFeatureGatedModel());

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Licenses', 'Entitlements']);
    await expect(nav.entry('Add-ons')).toHaveCount(0);
    await expect(nav.entry('Vouchers')).toHaveCount(0);
  });

  test('list every entry when every part is shipped, the add-ons and the vouchers after the licenses and the entitlements', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingFullModel());

    await nav.gotoShell();
    await expect(nav.entry('Invoices')).toHaveAttribute('href', '/invoices');
    await nav.open();

    await nav.expectEntries([
      'Invoices',
      'Licenses',
      'Entitlements',
      'Add-ons',
      'Vouchers',
    ]);
    await expect(nav.entry('Licenses')).toHaveAttribute(
      'href',
      '/catalog/licenses',
    );
    await expect(nav.entry('Entitlements')).toHaveAttribute(
      'href',
      '/catalog/entitlements',
    );
    await expect(nav.entry('Add-ons')).toHaveAttribute(
      'href',
      '/catalog/addons',
    );
    await expect(nav.entry('Vouchers')).toHaveAttribute(
      'href',
      '/catalog/vouchers',
    );
  });

  test('mark the Invoices entry as the current one on the list and on an invoice', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await page.goto('/invoices');
    await expect(nav.entry('Invoices')).toHaveAttribute('aria-current', 'page');

    await page.goto('/invoices/inv-m1');
    await expect(nav.entry('Invoices')).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('the icons of billing', () => {
  test('draws the Invoices entry with the receipt with its lines, the one of an invoice', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await nav.gotoShell();

    const icon = nav.entry('Invoices').locator('svg').first();
    await expect(icon).toHaveClass(RECEIPT_TEXT);
    await expect(icon).not.toHaveClass(RECEIPT);
  });

  for (const [path, what] of [
    ['/invoices', 'the list of the invoices'],
    ['/invoices?view=handoff', 'the handoff queue'],
    ['/invoices/inv-m1', 'one invoice'],
  ] as const) {
    test(`draws an invoice with the receipt with its lines in the header of ${what}`, async ({
      page,
    }) => {
      await installBillingAppMocks(page, createInvoicesModel());

      await page.goto(path);

      await expect(
        page.getByRole('main').getByRole('heading', { level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole('main').locator('svg.lucide-receipt-text').first(),
      ).toBeVisible();
      await expect(
        page.getByRole('main').locator('svg.lucide-receipt'),
      ).toHaveCount(0);
    });
  }
});
