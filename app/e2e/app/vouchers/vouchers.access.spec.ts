import { expect, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { VoucherDetailDriver } from '../_support/drivers/voucher-detail.driver';
import { VoucherListDriver } from '../_support/drivers/voucher-list.driver';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { BILLED_NOW } from '../billing/billed-instances';
import { installVouchersWorld } from './install-vouchers-world';
import {
  createVouchersBillingModel,
  createVouchersNotShippedBillingModel,
} from './vouchers.scenarios';

// Where the vouchers are, and who may do what to them. They exist where billing is on and the
// release ships them; the Billing section lists them to a session that may read them; and a
// session that may only read sees the catalogue and the code with none of its controls.

const CATALOGUE_REQUESTS = /^\/api\/vouchers(\/|$)/;

test.describe('the entry of the navigation', () => {
  test('lists the vouchers beside the invoices where the release ships them, and opens them', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page);

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Add-ons', 'Vouchers']);
    await expect(nav.entry('Vouchers')).toHaveAttribute('href', '/catalog/vouchers');
    await nav.entry('Vouchers').click();
    await expect(page).toHaveURL('/catalog/vouchers');
    await list.expectLoaded();
    // On a page of the section, the section stays open.
    await expect(nav.section()).toHaveAttribute('aria-expanded', 'true');
  });

  test('stays on the entry while a voucher is read', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installVouchersWorld(page);

    await page.goto('/catalog/vouchers/voucher-welcome');

    await expect(nav.section()).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.entry('Vouchers')).toHaveAttribute('aria-current', 'page');
  });

  test('is left out where the release does not ship them', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installVouchersWorld(page, createVouchersNotShippedBillingModel());

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Add-ons']);
    await expect(nav.entry('Vouchers')).toHaveCount(0);
  });

  test('is left out for a session that may not read them, and offered to one that may', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await signInWithScopes(page, [
      'read:billing',
      'read:instances',
      'read:addons',
    ]);
    await installVouchersWorld(page);

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Add-ons']);
    await expect(nav.entry('Vouchers')).toHaveCount(0);

    await signInWithScopes(page, [...SESSION_SCOPES.reader]);
    await nav.gotoShell();
    await nav.open();
    await expect(nav.entry('Vouchers')).toBeVisible();
  });
});

test.describe('where the release ships no vouchers', () => {
  for (const path of [
    '/catalog/vouchers',
    '/catalog/vouchers/new',
    '/catalog/vouchers/voucher-welcome',
    '/catalog/vouchers/voucher-draft/edit',
  ]) {
    test(`explains on ${path}, in place of the screen`, async ({ page }) => {
      const nav = new BillingNavDriver(page);
      await installVouchersWorld(page, createVouchersNotShippedBillingModel());

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
    await installVouchersWorld(page, createVouchersNotShippedBillingModel());

    await page.goto('/catalog/vouchers/voucher-welcome');
    await nav.expectUnavailable('FEATURE_UNAVAILABLE');

    expect(requests).toEqual([]);
  });

  test('offers no card of vouchers on the Billing tab of an instance, and no code in the dialog that subscribes', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await installVouchersWorld(page, createVouchersNotShippedBillingModel());

    await page.goto('/customers/instances/initech-prod/billing');
    await expect(
      page.getByRole('tab', { name: 'Billing', exact: true }),
    ).toBeVisible();

    await expect(page.getByTestId('instance-vouchers')).toHaveCount(0);

    await page.goto('/customers/instances/initech-fresh/billing/subscribe');
    await expect(
      page.getByRole('dialog').getByLabel(/^Base price/),
    ).toBeVisible();
    await expect(page.getByLabel(/^Voucher code/)).toHaveCount(0);
  });
});

test.describe('a voucher the API refuses to give', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
  });

  test('is explained in the API words on a deep link, around the console, and read again on retry', async ({
    page,
  }) => {
    const model = createVouchersBillingModel();
    model.vouchers.armProblem('getVoucher', {
      code: 'GetVoucher.MissingScope',
      detail: 'The scope read:vouchers is needed to read a voucher',
      status: 403,
    });
    await installVouchersWorld(page, model);

    await page.goto('/catalog/vouchers/voucher-welcome');

    const error = page.getByTestId('billing-route-error');
    await expect(error).toContainText(
      'The scope read:vouchers is needed to read a voucher',
    );
    await error.getByRole('button', { name: 'Retry' }).click();
    await new VoucherDetailDriver(page).expectLoaded('Welcome spring');
  });

  test('is explained the same way where it is the discount a boost is made for', async ({
    page,
  }) => {
    const model = createVouchersBillingModel();
    model.vouchers.armProblem('getVoucher', {
      code: 'GetVoucher.MissingScope',
      detail: 'The scope read:vouchers is needed to read a voucher',
      status: 403,
    });
    await installVouchersWorld(page, model);

    await page.goto('/catalog/vouchers/new?boostFor=voucher-welcome');

    await expect(page.getByTestId('billing-route-error')).toContainText(
      'The scope read:vouchers is needed to read a voucher',
    );
  });
});

test.describe('a session that may only read the vouchers', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await signInWithScopes(page, [...SESSION_SCOPES.reader]);
    await installVouchersWorld(page);
  });

  test('reads the catalogue, with no way to make a voucher', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);

    await list.goto();
    await list.searchField().fill('Welcome spring');

    await expect(list.row('Welcome spring')).toContainText(
      'WELCOME-SPRING-2027',
    );
    await expect(list.newVoucher()).toHaveCount(0);
  });

  test('reads a voucher with its code and what was redeemed of it, and nothing to edit, publish, archive or revoke', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);

    await detail.goto('voucher-welcome', 'Welcome spring');

    await expect(detail.code()).toHaveText('WELCOME-SPRING-2027');
    await expect(detail.redemption('initech-annual')).toBeVisible();
    await expect(detail.editLink()).toHaveCount(0);
    await expect(detail.addBoostLink()).toHaveCount(0);
    await expect(detail.archiveButton()).toHaveCount(0);
    await expect(detail.publishButton()).toHaveCount(0);
    await expect(detail.revokeButton('initech-annual')).toHaveCount(0);
  });

  test('is not offered the wizard a link asks for a draft, nor the dialog that changes a voucher', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);

    await page.goto('/catalog/vouchers/voucher-welcome?mode=configure');
    await detail.expectLoaded('Welcome spring');

    await expect(detail.dialog()).toHaveCount(0);
  });
});

test.describe('a session that may write the vouchers', () => {
  test('is offered every control of the catalogue', async ({ page }) => {
    const list = new VoucherListDriver(page);
    const detail = new VoucherDetailDriver(page);
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await signInWithScopes(page, [...SESSION_SCOPES.admin]);
    await installVouchersWorld(page);

    await list.goto();
    await expect(list.newVoucher()).toBeVisible();

    await detail.goto('voucher-welcome', 'Welcome spring');
    await expect(detail.editLink()).toBeVisible();
    await expect(detail.addBoostLink()).toBeVisible();
    await expect(detail.archiveButton()).toBeVisible();
    await expect(detail.revokeButton('initech-annual')).toBeVisible();
  });
});
