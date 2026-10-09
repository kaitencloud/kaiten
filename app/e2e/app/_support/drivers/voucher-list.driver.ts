import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The list of vouchers: every voucher of the organization with its code, kind, state, how
 * often it was redeemed, until when and for whom, to search and filter in the browser; the
 * search matches the code as well as the name and the customer. A voucher is made in a wizard
 * (`VoucherWizardDriver`) and read on its own page (`VoucherDetailDriver`).
 */
export class VoucherListDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/vouchers');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Vouchers' }),
    ).toBeVisible();
  }

  /** The call to make a voucher: a link, since the wizard is a page of its own. */
  newVoucher(): Locator {
    return this.page.getByRole('link', { name: 'New voucher' }).first();
  }

  searchField(): Locator {
    return this.page.getByPlaceholder('Name, code or customer');
  }

  /** The rows of the table, header apart. */
  rows(): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell') });
  }

  /** One row, found by the name of its voucher. */
  row(name: string): Locator {
    return this.rows().filter({ hasText: name });
  }

  async open(name: string) {
    await this.row(name).getByRole('link', { name }).click();
  }

  empty(): Locator {
    return this.page.getByTestId('vouchers-empty');
  }

  /** What the table says when a search or a filter hides every row. */
  filteredEmpty(): Locator {
    return this.page.getByTestId('vouchers-filtered-empty');
  }
}
