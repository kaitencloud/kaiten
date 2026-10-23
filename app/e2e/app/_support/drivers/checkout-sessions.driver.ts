import { expect, type Locator } from '@playwright/test';
import { FilterToolbarDriver } from './filter-toolbar.driver';

/**
 * The checkouts under Customers (`/customers/checkout-sessions`): the anonymous
 * checkouts of the organization with what created each, to search and filter in the
 * browser, and the panel that opens over the list on `?session=<id>`.
 */
export class CheckoutSessionsDriver extends FilterToolbarDriver {
  protected searchPlaceholder =
    'Search by email, reference, license, customer or key…';

  async goto(search = '') {
    await this.page.goto(`/customers/checkout-sessions${search}`);
    await this.expectLoaded();
  }

  /** The title of the page, which stays when the panel is open although the panel hides the page from the roles. */
  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', {
        includeHidden: true,
        level: 1,
        name: 'Checkouts',
      }),
    ).toBeVisible();
  }

  /**
   * The rows of the table, header and the message of an empty list apart. A row opens the
   * panel of its checkout, so the table gives it the role of a button.
   */
  rows(): Locator {
    return this.page.locator('tbody tr[role="button"]');
  }

  /** One row, found by what it shows: the e-mail, a reference. */
  row(text: string): Locator {
    return this.rows().filter({ hasText: text });
  }

  empty(): Locator {
    return this.page.getByTestId('checkout-sessions-empty');
  }

  filteredEmpty(): Locator {
    return this.page.getByTestId('checkout-sessions-filtered-empty');
  }

  /** A tab above the pages of Customers: the last link of that name, the breadcrumb having one before it. */
  tab(name: string): Locator {
    return this.page
      .locator('main')
      .getByRole('link', { exact: true, name })
      .last();
  }

  // --- The panel of one checkout -----------------------------------------------------

  panel(): Locator {
    return this.page.getByRole('dialog');
  }

  detail(): Locator {
    return this.page.getByTestId('checkout-session-detail');
  }

  gone(): Locator {
    return this.page.getByTestId('checkout-session-gone');
  }

  /** A row of the panel by its label: the row, which holds its value. */
  detailRow(label: string): Locator {
    return this.detail()
      .locator('dl > div')
      .filter({ has: this.page.getByText(label, { exact: true }) });
  }

  async close() {
    await this.page.keyboard.press('Escape');
    await expect(this.panel()).toHaveCount(0);
  }
}
