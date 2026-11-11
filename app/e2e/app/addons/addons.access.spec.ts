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
import { BILLED_NOW } from '../billing/billed-instances';
import { InstanceAddonsDriver } from '../_support/drivers/instance-addons.driver';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import { createAddonsBillingModel } from './addons.scenarios';
import { installAddonsWorld } from './install-addons-world';

// Where the add-ons are, and who may do what to them. They exist where billing is on and the
// baseline grants it; the Catalog section remains readable after independent feature grant loss; a
// session that may only read sees the catalogue with none of its controls.

test.describe('the entry of the navigation', () => {
  test('lists the add-ons in the catalog where the release ships them, and opens them', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const list = new AddonsListDriver(page);
    await installAddonsWorld(page);

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries([
      'Invoices',
      'Licenses',
      'Entitlements',
      'Add-ons',
    ]);
    await expect(nav.entry('Add-ons')).toHaveAttribute(
      'href',
      '/catalog/addons',
    );
    await expect(nav.entry('Vouchers')).toBeVisible();
    await nav.entry('Add-ons').click();
    await expect(page).toHaveURL('/catalog/addons');
    await list.expectLoaded();
    // On a page of the section, the section stays open.
    await expect(nav.catalog()).toHaveAttribute('aria-expanded', 'true');
  });

  test('stays on the entry while a version of an add-on is read', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installAddonsWorld(page);

    await page.goto('/catalog/addons/extra-seats-v1/prices');

    await expect(nav.catalog()).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.entry('Add-ons')).toHaveAttribute('aria-current', 'page');
  });

  test('remains reachable when the independent grant is lost', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await nav.gotoShell();

    // Existing catalogue reads remain reachable without the independent grant.
    await nav.open();
    await nav.expectEntries([
      'Invoices',
      'Licenses',
      'Entitlements',
      'Add-ons',
    ]);
    await expect(nav.entry('Add-ons')).toBeVisible();
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

    // The catalog keeps the licenses and the entitlements, without the add-ons.
    await nav.open();
    await nav.expectEntries(['Invoices', 'Licenses', 'Entitlements']);
    await expect(nav.entry('Add-ons')).toHaveCount(0);

    await signInWithScopes(page, [...SESSION_SCOPES.reader]);
    await nav.gotoShell();
    await nav.open();
    await expect(nav.entry('Add-ons')).toBeVisible();
  });
});

test.describe('after the add-ons grant is lost', () => {
  function downgraded() {
    const model = createAddonsBillingModel();
    model.setCapabilities(billingCapabilitiesProfiles.stack());
    return model;
  }

  for (const path of [
    '/catalog/addons/new',
    '/catalog/addons/extra-seats-v1?mode=configure',
    '/catalog/addons/extra-seats-v2/entitlements?grant=new',
    '/catalog/addons/extra-seats-v2/prices?price=new',
    '/customers/instances/initech-prod/billing/attach-addon',
  ]) {
    test(`blocks expansion at ${path}`, async ({ page }) => {
      await installAddonsWorld(page, downgraded());
      await page.goto(path);
      await new BillingNavDriver(page).expectUnavailable('FEATURE_UNAVAILABLE');
    });
  }

  test('reads existing version tabs directly after grant loss', async ({
    page,
  }) => {
    await installAddonsWorld(page, downgraded());
    for (const path of [
      '/catalog/addons/extra-seats-v1',
      '/catalog/addons/extra-seats-v1/entitlements',
      '/catalog/addons/extra-seats-v1/prices',
      '/catalog/addons/extra-seats-v1/compatibility',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'Extra seats',
      );
      await expect(page.getByTestId('billing-unavailable')).toHaveCount(0);
      await expect(page.locator('[data-addon-edit]')).toHaveCount(0);
    }
  });

  test('keeps catalogue retirement controls and held quantities readable', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await installAddonsWorld(page, downgraded());
    const list = new AddonsListDriver(page);
    await list.goto();
    await list.expandFamily('Extra seats');
    await expect(list.newAddon()).toHaveCount(0);
    await expect(list.action('Extra seats', '2027', 'Publish')).toHaveCount(0);
    await expect(list.action('Extra seats', '2027', 'Delete')).toBeVisible();
    await expect(
      list.action('Extra seats', '2026', 'Unset default'),
    ).toBeVisible();
    await list.action('Extra seats', '2026', 'Unset default').click();
    await expect(list.action('Extra seats', '2026', 'Archive')).toBeEnabled();
    await expect(page.getByRole('link', { name: 'New Version' })).toHaveCount(
      0,
    );

    await page.goto('/customers/instances/initech-prod/billing');
    const held = new InstanceAddonsDriver(page);
    await expect(held.row('Extra seats')).toBeVisible();
    await expect(held.attachLink()).toHaveCount(0);
    await expect(held.more('Extra seats')).toBeDisabled();
    await held.fewer('Extra seats').click();
    await expect(held.quantity('Extra seats')).toHaveText('1');
    await held.removeButton('Extra seats').click();
    await held.confirmRemoval();
    await expect(held.row('Extra seats')).toHaveCount(0);
  });

  test('retries an unknown feature check instead of keeping a cached denial', async ({
    page,
  }) => {
    const model = downgraded();
    model.setCapabilities({
      ...model.getCapabilities(),
      featureCheckUnavailable: ['addons'],
    });
    await installAddonsWorld(page, model);
    await page.goto('/catalog/addons/new');
    await new BillingNavDriver(page).expectUnavailable('UNREACHABLE');
    model.setCapabilities(billingCapabilitiesProfiles.stackWithAddons());
    await installBillingAppMocks(page, model);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('billing-unavailable')).toHaveCount(0);
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

    await page.goto('/catalog/addons/extra-seats-v2/prices?price=new');

    await expect(page).toHaveURL('/catalog/addons/extra-seats-v2/prices');
    await expect(prices.drawer()).toHaveCount(0);

    await page.goto('/catalog/addons/extra-seats-v2/entitlements?grant=new');
    await expect(page).toHaveURL('/catalog/addons/extra-seats-v2/entitlements');
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
