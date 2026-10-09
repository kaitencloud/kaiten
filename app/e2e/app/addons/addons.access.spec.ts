import { expect, test } from '../_support/app-test';
import { AddonCompatibilityDriver } from '../_support/drivers/addon-compatibility.driver';
import { AddonDetailDriver } from '../_support/drivers/addon-detail.driver';
import { AddonGrantsDriver } from '../_support/drivers/addon-grants.driver';
import { AddonPricesDriver } from '../_support/drivers/addon-prices.driver';
import { AddonsListDriver } from '../_support/drivers/addons-list.driver';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createBillingStackModel } from '../billing/billing.scenarios';
import { installAddonsWorld } from './install-addons-world';

// Where the add-ons are, and who may do what to them. They exist where billing is on and the
// release ships them; the Billing section lists them to a session that may read them; and a
// session that may only read sees the catalogue with none of its controls.

const CATALOGUE_REQUESTS = /^\/api\/(addons|addon-families)(\/|$)/;

test.describe('the entry of the navigation', () => {
  test('lists the add-ons beside the invoices where the release ships them, and opens them', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const list = new AddonsListDriver(page);
    await installAddonsWorld(page);

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Add-ons']);
    await expect(nav.entry('Add-ons')).toHaveAttribute('href', '/addons');
    await expect(nav.entry('Vouchers')).toHaveCount(0);
    await nav.entry('Add-ons').click();
    await expect(page).toHaveURL('/addons');
    await list.expectLoaded();
    // On a page of the section, the section stays open.
    await expect(nav.section()).toHaveAttribute('aria-expanded', 'true');
  });

  test('stays on the entry while a version of an add-on is read', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installAddonsWorld(page);

    await page.goto('/addons/extra-seats-v1/prices');

    await expect(nav.section()).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.entry('Add-ons')).toHaveAttribute('aria-current', 'page');
  });

  test('is left out where the release does not ship them', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await nav.gotoShell();

    // Nothing else is in the section, which is then not drawn.
    await nav.expectEntries(['Invoices']);
    await expect(nav.section()).toHaveCount(0);
    await expect(nav.entry('Add-ons')).toHaveCount(0);
  });

  test('is left out for a session that may not read them, and offered to one that may', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await signInWithScopes(page, [
      'read:billing',
      'read:instances',
      'read:licenses',
    ]);
    await installAddonsWorld(page);

    await nav.gotoShell();

    // Nothing else is in the section, which is then not drawn.
    await nav.expectEntries(['Invoices']);
    await expect(nav.section()).toHaveCount(0);
    await expect(nav.entry('Add-ons')).toHaveCount(0);

    await signInWithScopes(page, [...SESSION_SCOPES.reader]);
    await nav.gotoShell();
    await nav.open();
    await expect(nav.entry('Add-ons')).toBeVisible();
  });
});

test.describe('where the release ships no add-ons', () => {
  for (const path of [
    '/addons',
    '/addons/new',
    '/addons/extra-seats-v1',
    '/addons/extra-seats-v1/entitlements',
    '/addons/extra-seats-v1/prices',
    '/addons/extra-seats-v1/compatibility',
  ]) {
    test(`explains on ${path}, in place of the screen`, async ({ page }) => {
      const nav = new BillingNavDriver(page);
      await installBillingAppMocks(page, createBillingStackModel());

      await page.goto(path);

      await nav.expectUnavailable('FEATURE_UNAVAILABLE');
      await expect(
        page.getByText('Not available in this version'),
      ).toBeVisible();
      // An explanation, not an error and not a missing page.
      await expect(page.getByText('Page not found')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }

  test('asks the API for nothing of the catalogue', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    const requests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (CATALOGUE_REQUESTS.test(pathname)) {
        requests.push(`${request.method()} ${pathname}`);
      }
    });
    await installBillingAppMocks(page, createBillingStackModel());

    await page.goto('/addons/extra-seats-v1');
    await nav.expectUnavailable('FEATURE_UNAVAILABLE');

    expect(requests).toEqual([]);
  });
});

test.describe('a session that may only read the add-ons', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithScopes(page, [
      ...SESSION_SCOPES.reader,
      'read:entitlements',
    ]);
    await installAddonsWorld(page);
  });

  test('reads the catalogue, with no way to make, list or move a version', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    await list.goto();
    await list.expandFamily('Extra seats');

    await expect(list.versionRow('Extra seats', '2026')).toContainText(
      'Published',
    );
    await expect(list.newAddon()).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'New Version' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('switch')).toHaveCount(0);
    for (const label of ['Publish', 'Archive', 'Set as default', 'Delete']) {
      await expect(list.action('Extra seats', '2027', label)).toHaveCount(0);
    }
    // The family reads as listed or not all the same.
    await expect(list.publicBadge('Extra seats')).toBeVisible();
  });

  test('reads a version, with nothing to edit, publish or delete', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);

    await detail.goto('extra-seats-v2', 'Extra seats');

    await detail.expectState('Draft');
    await expect(detail.editLink()).toHaveCount(0);
    for (const label of ['Publish', 'Set as default', 'Delete']) {
      await expect(detail.action(label)).toHaveCount(0);
    }
  });

  test('reads what a version grants, with no way to give, change or remove one', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);

    await grants.goto('extra-tokens-v1', 'Extra tokens');

    await expect(grants.row('Tokens')).toContainText('10,000 per unit');
    await expect(grants.addLink()).toHaveCount(0);
    await expect(grants.editLink('Tokens')).toHaveCount(0);
    await expect(grants.removeButton('Tokens')).toHaveCount(0);
  });

  test('reads what a version is sold for, with no way to add or deprecate a price', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);

    await prices.goto('extra-seats-v2', 'Extra seats');

    await expect(prices.row('Extra seat, monthly')).toContainText('Default');
    await expect(prices.addPrice()).toHaveCount(0);
    await expect(prices.deprecateButton('Extra seat, monthly')).toHaveCount(0);
  });

  test('reads which licenses a version fits, with boxes it cannot change', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);

    await compatibility.goto('extra-seats-v1', 'Extra seats');

    await expect(compatibility.box(/^Pro/)).toBeChecked();
    await expect(compatibility.box(/^Pro/)).toBeDisabled();
    await expect(compatibility.box(/^Enterprise/)).toBeDisabled();
  });

  test('is not offered the drawer or the dialog a link asks for', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);

    await page.goto('/addons/extra-seats-v2/prices?price=new');

    await expect(page).toHaveURL('/addons/extra-seats-v2/prices');
    await expect(prices.drawer()).toHaveCount(0);

    await page.goto('/addons/extra-seats-v2/entitlements?grant=new');
    await expect(page).toHaveURL('/addons/extra-seats-v2/entitlements');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('a session that may write the add-ons', () => {
  test('is offered every control of the catalogue', async ({ page }) => {
    const list = new AddonsListDriver(page);
    await signInWithScopes(page, [...SESSION_SCOPES.admin]);
    await installAddonsWorld(page);

    await list.goto();
    await list.expandFamily('Extra seats');

    await expect(list.newAddon()).toBeVisible();
    await expect(list.publicSwitch('Extra seats')).toBeVisible();
    for (const label of ['Publish', 'Set as default', 'Delete']) {
      await expect(list.action('Extra seats', '2027', label)).toBeVisible();
    }
  });
});
