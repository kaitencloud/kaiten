import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The invoice preview of a license version: the dialog the Prices tab opens, its
 * sample usage, and the invoice the API composed from it.
 */
export class LicensePreviewDriver {
  constructor(private readonly page: Page) {}

  /** The tab's button that opens the dialog. */
  openButton(): Locator {
    return this.page.getByRole('button', {
      name: 'Preview invoice',
      exact: true,
    });
  }

  async open() {
    await this.openButton().click();
    await expect(this.dialog()).toBeVisible();
  }

  dialog(): Locator {
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: 'Preview an invoice' }),
    });
  }

  /** The banner that says what it is: a preview, not an invoice. */
  banner(): Locator {
    return this.dialog()
      .getByRole('alert')
      .filter({ hasText: 'Preview, not an invoice' });
  }

  /** The sample usage of an entitlement, by its name. */
  sample(name: string): Locator {
    return this.dialog().getByRole('textbox', { name, exact: true });
  }

  /** The group of the samples, named by its legend. */
  sampleUsage(): Locator {
    return this.dialog().getByRole('group', { name: 'Sample usage' });
  }

  /** The refusal of the sample usage, shown on it. */
  sampleError(): Locator {
    return this.sampleUsage().getByRole('alert');
  }

  /** The base price, a select the dialog shows when there is more than one. */
  base(): Locator {
    return this.dialog()
      .locator('[data-field-name="basePriceId"]')
      .getByRole('combobox');
  }

  async chooseBase(name: string | RegExp) {
    await this.base().click();
    await this.page.getByRole('option', { name }).click();
  }

  run(): Locator {
    return this.dialog().getByRole('button', {
      name: 'Run preview',
      exact: true,
    });
  }

  /** The invoice the API composed. */
  result(): Locator {
    return this.dialog().getByRole('region', { name: 'Invoice preview' });
  }

  /** The rows of the invoice, one per line. */
  lines(): Locator {
    return this.result()
      .getByRole('row')
      .filter({ hasNot: this.page.getByRole('columnheader') });
  }

  totals(): Locator {
    return this.dialog().getByTestId('invoice-totals');
  }

  /** What is shown of a problem the API raised, under the form. */
  problem(): Locator {
    return this.dialog().locator('[data-slot="alert"][data-kind]');
  }

  async close() {
    await this.dialog()
      .getByRole('button', { name: 'Close', exact: true })
      .last()
      .click();
    await expect(this.dialog()).toHaveCount(0);
  }
}
