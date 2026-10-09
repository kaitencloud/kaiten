import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { readConsoleStorage } from '../_support/assertions/storage';
import { FilterToolbarDriver } from '../_support/drivers/filter-toolbar.driver';
import { VoucherDetailDriver } from '../_support/drivers/voucher-detail.driver';
import { VoucherListDriver } from '../_support/drivers/voucher-list.driver';
import { BILLED_NOW } from '../billing/billed-instances';
import { createEmptyVouchersBillingModel } from './vouchers.scenarios';
import { installVouchersWorld } from './install-vouchers-world';

// The catalogue of vouchers: every voucher of the organization with its code, its kind, its
// state, how often it was redeemed, until when and for whom, to search and filter in the
// browser, and a box that opens a voucher by the code a customer sends. The page is frozen
// at BILLED_NOW (2026-10-07), because the state of a voucher is read from its window: the
// API never sets one EXPIRED, and an ACTIVE voucher stays ACTIVE past its end.

test.describe('the list of vouchers', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
  });

  test('lists every voucher with its code, its kind, how often it was redeemed, until when and for whom', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page);

    await list.goto();

    // The table pages what it holds, ten rows at a time.
    await expect(list.rows()).toHaveCount(10);
    await expect(page.getByText('Showing 1-10 of 13 records')).toBeVisible();
    await list.searchField().fill('Welcome spring');
    const welcome = list.row('Welcome spring');
    await expect(welcome).toContainText('WELCOME-SPRING-2027');
    await expect(welcome).toContainText('Discount');
    await expect(welcome).toContainText('Active');
    await expect(welcome).toContainText('2 of 100');
    await expect(welcome).toContainText('Jun 30, 2027 (UTC)');
    await expect(welcome).toContainText('Any customer');
    await list.searchField().fill('Launch boost');
    await expect(list.row('Launch boost')).toContainText('Boost');
    await expect(list.row('Launch boost')).toContainText('0 of 5');
    await list.searchField().fill('Hooli only');
    await expect(list.row('Hooli only')).toContainText('0 (no limit)');
    await expect(list.row('Hooli only')).toContainText('No end date');
  });

  test('says the state a person reads, which the console derives from the window and the count', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page);

    await list.goto();

    // The API stores the first ACTIVE, and its window closed in June.
    const states: Array<[string, string]> = [
      ['Spring 2026 promotion', 'Expired'],
      ['Hooli agreement', 'Fully redeemed'],
      ['Summer sale', 'Draft'],
      ['Black Friday 2025', 'Archived'],
      ['Welcome spring', 'Active'],
    ];
    for (const [name, state] of states) {
      await list.searchField().fill(name);
      await expect(list.row(name)).toContainText(state);
    }
  });

  test('names the customer a voucher is reserved for', async ({ page }) => {
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page);

    await list.goto();

    await list.searchField().fill('Hooli agreement');
    await expect(list.row('Hooli agreement')).toContainText('Hooli');
    await expect(list.row('Hooli agreement')).not.toContainText('Any customer');
  });

  test('searches the name, the code and the customer, in any case and in part, and says when none matches', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page);
    await list.goto();

    await list.searchField().fill('welcome-spring');
    await expect(list.rows()).toHaveCount(1);
    await expect(list.row('Welcome spring')).toBeVisible();

    await list.searchField().fill('HOOLI');
    await expect(list.row('Hooli agreement')).toBeVisible();
    await expect(list.row('Hooli only')).toBeVisible();
    await expect(list.row('Welcome spring')).toHaveCount(0);

    await list.searchField().fill('zzz');
    await expect(list.filteredEmpty()).toContainText('No voucher matches');
    await page.getByRole('button', { name: 'Clear the filters' }).click();
    await expect(list.rows()).toHaveCount(10);
  });

  test('filters by the state a person reads', async ({ page }) => {
    const list = new VoucherListDriver(page);
    const filters = new FilterToolbarDriver(page);
    await installVouchersWorld(page);
    await list.goto();

    await filters.addFilter('Status');
    await filters.pick('Expired');
    await filters.closeEditor();

    await expect(list.rows()).toHaveCount(1);
    await expect(list.row('Spring 2026 promotion')).toBeVisible();
  });

  test('keeps what is typed in the search out of the address and the storage of the browser', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page);
    await list.goto();

    await list.searchField().fill('WELCOME-SPRING-2027');
    await expect(list.rows()).toHaveCount(1);

    expect(page.url()).not.toMatch(/WELCOME/i);
    // What the console stores, not the state of the mocked API, which the suite keeps in the
    // same storage and which holds every code.
    const stored = await readConsoleStorage(page);
    expect(stored).not.toMatch(/WELCOME/i);
  });

  test('opens a voucher from its row, on a page of its own addressed by its id', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);
    await list.goto();

    await list.open('Launch boost');

    await detail.expectLoaded('Launch boost');
    await expect(page).toHaveURL('/vouchers/voucher-launch-boost');
  });

  test('offers to make a voucher, and says where one comes from when there is none', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page, createEmptyVouchersBillingModel());

    await list.goto();

    await expect(list.empty()).toContainText('No voucher yet');
    await expect(list.newVoucher()).toHaveAttribute('href', '/vouchers/new');
  });
});

test.describe('opening a voucher by its code', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
  });

  test('asks the API with the code in the body of a POST, goes to the voucher by its id and keeps the code out of every address', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    const detail = new VoucherDetailDriver(page);
    const lookups = recordWrites(page, /\/api\/vouchers\/lookup$/);
    const everyRequest: string[] = [];
    page.on('request', (request) => everyRequest.push(request.url()));
    await installVouchersWorld(page);
    await list.goto();

    // A code is matched without case or separators: the way a customer writes it.
    await list.lookup('welcome spring 2027');

    await detail.expectLoaded('Welcome spring');
    await expect(page).toHaveURL('/vouchers/voucher-welcome');
    expect(lookups).toHaveLength(1);
    expect(lookups[0].body).toEqual({ code: 'welcome spring 2027' });
    expect(
      everyRequest.filter(
        (url) => /welcome/i.test(url) && !/voucher-welcome/.test(url),
      ),
    ).toEqual([]);
  });

  test('says no voucher has the code when none does, and goes nowhere', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page);
    await list.goto();

    await list.lookup('NOT-A-VOUCHER-CODE');

    await expect(list.lookupNotFound()).toBeVisible();
    await expect(page).toHaveURL('/vouchers');
  });

  test('cannot be sent empty, and is a text field that no browser fills in', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    await installVouchersWorld(page);
    await list.goto();

    await expect(list.lookupButton()).toBeDisabled();
    await expect(list.lookupField()).toHaveAttribute('type', 'text');
    await expect(list.lookupField()).toHaveAttribute('autocomplete', 'off');
  });
});

test.describe('a page that is none', () => {
  test('says there is nothing to show for a voucher that does not exist', async ({
    page,
  }) => {
    await installVouchersWorld(page);

    await page.goto('/vouchers/no-such-voucher');

    await expect(page.getByText('Page not found')).toBeVisible();
  });
});
