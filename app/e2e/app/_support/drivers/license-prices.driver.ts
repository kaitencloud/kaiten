import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The Prices tab of a license version: its table, its summary and the notes of
 * its state. What the editor, the deprecation and the preview add to it join
 * this driver as those flows are driven.
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
}
