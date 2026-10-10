import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The billing entries of the side nav: the Invoices entry, which stands on its own
 * where billing is on, and the Catalog section, which holds the licenses and the
 * entitlements on every deployment and the add-ons and the vouchers where the release
 * ships them, and the explanation a billing route shows where billing is not there. The
 * section opens by itself on a page of it; anywhere else it is a closed toggle, which
 * `open` clicks.
 */
export class BillingNavDriver {
  constructor(private readonly page: Page) {}

  private get content(): Locator {
    return this.page.locator('[data-sidebar="content"]');
  }

  /**
   * Opens a page with no data of its own, so that the shell is all there is to
   * read, and waits for the rest of the navigation: it is complete when its
   * other entries are, so what is not in it by then is not coming.
   */
  async gotoShell() {
    await this.page.goto('/settings');
    await expect(
      this.page.getByRole('heading', { name: 'Settings', level: 1 }),
    ).toBeVisible();
    await expect(this.entry('Customers')).toBeVisible();
  }

  /** The toggle of the Catalog section. */
  catalog(): Locator {
    return this.content.getByRole('button', { name: 'Catalog', exact: true });
  }

  /** The glyph of the section, which is the license's: the catalog is what is sold. */
  catalogIcon(): Locator {
    return this.catalog().locator('svg').first();
  }

  entry(label: string): Locator {
    return this.content.getByRole('link', { name: label, exact: true });
  }

  /** The explanation a guarded billing route renders in place of its screen. */
  unavailable(): Locator {
    return this.page.getByTestId('billing-unavailable');
  }

  async open() {
    const catalog = this.catalog();
    await expect(catalog).toBeVisible();
    if ((await catalog.getAttribute('aria-expanded')) !== 'true') {
      await catalog.click();
    }
  }

  async expectEntries(labels: string[]) {
    for (const label of labels) {
      await expect(this.entry(label)).toBeVisible();
    }
  }

  /**
   * Where billing is not there: the catalog keeps the licenses and the entitlements,
   * and holds no add-ons or vouchers; there are no invoices either.
   */
  async expectNoBillingEntries() {
    await this.open();
    await this.expectEntries(['Licenses', 'Entitlements']);
    for (const label of ['Invoices', 'Add-ons', 'Vouchers']) {
      await expect(this.entry(label)).toHaveCount(0);
    }
  }

  async expectUnavailable(
    reason:
      | 'DEPLOYMENT_DISABLED'
      | 'NOT_ENTITLED'
      | 'MISSING_SCOPE'
      | 'FEATURE_UNAVAILABLE'
      | 'UNREACHABLE',
    options: { timeout?: number } = {},
  ) {
    await expect(this.unavailable()).toHaveAttribute(
      'data-reason',
      reason,
      options,
    );
  }
}
