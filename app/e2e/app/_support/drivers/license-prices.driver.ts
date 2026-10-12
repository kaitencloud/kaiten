import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The Prices tab of a license version: its table, its summary and the notes of
 * its state, and what is done to its prices from the table: adding one, editing
 * one, deprecating one. The drawer a price is edited in has its own driver
 * (`LicensePriceDrawerDriver`).
 */
export class LicensePricesDriver {
  constructor(private readonly page: Page) {}

  /** Opens the tab of a version by its URL, and waits for the version's name. */
  async goto(slug: string, name: string) {
    await this.page.goto(`/catalog/licenses/${slug}/prices`);
    await expect(
      this.page.getByRole('heading', { name, level: 1 }),
    ).toBeVisible();
  }

  tab(name: string): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }

  /** The tab's own card, which says what the version bills. */
  card(): Locator {
    return this.page
      .locator('[data-slot="card"]')
      .filter({ has: this.page.getByTestId('price-summary') });
  }

  summary(): Locator {
    return this.page.getByTestId('price-summary');
  }

  /** A row of the table, found by the label of its price. */
  row(label: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByText(label, { exact: true }) });
  }

  rows(): Locator {
    return this.page.getByRole('row').filter({
      hasNot: this.page.getByRole('columnheader'),
    });
  }

  /**
   * The labels of the prices, from the first row to the last, read in one
   * snapshot of the page: a table that is replaced while it is read (the tab
   * is reached by a navigation whose chunks are still loading, and the page it
   * leaves is still there) answers with what it shows then, and the caller reads
   * again, instead of waiting on a row that has gone.
   */
  async labels(): Promise<string[]> {
    // The label is the first line of the first cell, where a badge that says the
    // price is the default is another line.
    return this.rows().evaluateAll((rows) =>
      rows.map(
        (row) =>
          row.querySelector('td')?.innerText.split('\n')[0]?.trim() ?? '',
      ),
    );
  }

  async expectLabels(labels: string[]) {
    // The tab may be reached by a client-side navigation whose chunks the dev
    // server still has to build, which takes longer than an assertion's default.
    await expect.poll(() => this.labels(), { timeout: 20_000 }).toEqual(labels);
  }

  // --- What is done to the prices --------------------------------------------

  /** The tab's call to add a price: a link, since the drawer it opens is in the URL. */
  addPrice(): Locator {
    return this.page.getByRole('link', { name: 'Add price', exact: true });
  }

  /** A published or archived version's way to change what it sells: a new version, as a draft. */
  newVersion(): Locator {
    return this.page.getByRole('link', { name: 'New Version', exact: true });
  }

  /** The Edit link of a row, which leads to the drawer of its price. */
  edit(label: string): Locator {
    return this.row(label).getByRole('link', { name: `Edit ${label}` });
  }

  deprecate(label: string): Locator {
    return this.row(label).getByRole('button', {
      name: `Deprecate ${label}`,
    });
  }

  /** The confirmation a deprecation asks. */
  deprecateDialog(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async confirmDeprecation() {
    await this.deprecateDialog()
      .getByRole('button', { name: 'Deprecate', exact: true })
      .click();
  }

  /** The status of a row: `Active` or `Deprecated`. */
  status(label: string): Locator {
    return this.row(label).getByText(/^(Active|Deprecated)$/);
  }
}
