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

  // --- What else a preview can be given ------------------------------------------------

  /** The group that says where the usage comes from, offered to a session that may list the instances. */
  usage(): Locator {
    return this.dialog().getByRole('group', { name: 'Usage', exact: true });
  }

  /** One of the two sources of the usage, by its name: the samples, or an instance. */
  source(name: 'An instance' | 'Samples'): Locator {
    return this.usage().getByRole('button', { name: new RegExp(`^${name}`) });
  }

  /** The picker of the instance, whose button reads what is chosen. */
  instance(): Locator {
    return this.dialog()
      .locator('[data-field-name="instanceSlug"]')
      .getByRole('button');
  }

  async chooseInstance(name: string | RegExp) {
    await this.instance().click();
    await this.page.getByRole('option', { name }).click();
  }

  /** Adds a row to the list of add-ons. */
  async addAddOn() {
    await this.dialog()
      .getByRole('button', { name: 'Add an add-on', exact: true })
      .click();
  }

  addOnRows(): Locator {
    return this.dialog().getByTestId('preview-addon-row');
  }

  /** Chooses the version of the add-on of a row (from 0), and its units when it is given. */
  async chooseAddOn(row: number, name: string | RegExp, units?: number) {
    const line = this.addOnRows().nth(row);
    await line.getByRole('button', { name: /Choose an add-on|·/ }).click();
    await this.page.getByRole('option', { name }).click();
    if (units !== undefined) {
      await line.getByLabel(/^Units/).fill(String(units));
    }
  }

  async removeAddOn(row: number) {
    await this.dialog()
      .getByRole('button', { name: `Remove add-on ${row + 1}` })
      .click();
  }

  /** The field of the code of a voucher. */
  voucher(): Locator {
    return this.dialog().getByLabel('Promo code', { exact: true });
  }

  /** What the API refused of a field, under it, in its words. */
  fieldError(field: 'addOns' | 'instanceSlug' | 'voucherCode'): Locator {
    return this.dialog().locator(`[data-field-name="${field}"]`);
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
