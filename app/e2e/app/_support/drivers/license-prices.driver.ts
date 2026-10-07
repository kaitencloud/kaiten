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
    await this.page.goto(`/licenses/${slug}/prices`);
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

  /** The labels of the prices, from the first row to the last. */
  async labels(): Promise<string[]> {
    const rows = this.rows();
    const count = await rows.count();
    const labels: string[] = [];
    for (let index = 0; index < count; index += 1) {
      // The label is the first line of the first cell, where a badge that says
      // the price is the default is another line.
      const cell = await rows.nth(index).getByRole('cell').first().innerText();
      labels.push(cell.split('\n')[0].trim());
    }

    return labels;
  }

  async expectLabels(labels: string[]) {
    await expect.poll(() => this.labels()).toEqual(labels);
  }

  // --- What is done to the prices --------------------------------------------

  /** The tab's call to add a price: a link, since the drawer it opens is in the URL. */
  addPrice(): Locator {
    return this.page.getByRole('link', { name: 'Add price', exact: true });
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
