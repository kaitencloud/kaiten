import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The Prices tab of an add-on version: the slot of each billing period, the table of
 * its flat fees, the drawer a price is made in (`?price=new`) and the dialogs that ask
 * before a default is replaced and before a price is deprecated.
 */
export class AddonPricesDriver {
  constructor(private readonly page: Page) {}

  async goto(slug: string, title: string) {
    await this.page.goto(`/addons/${slug}/prices`);
    await expect(
      this.page.getByRole('heading', { name: title, level: 1 }),
    ).toBeVisible();
    await expect(this.slots()).toBeVisible();
  }

  /** The slot of each period a version is sold for. */
  slots(): Locator {
    return this.page.getByRole('region', {
      name: 'Default price of each billing period',
    });
  }

  slot(period: 'ANNUAL' | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL'): Locator {
    return this.slots().locator(`[data-period="${period}"]`);
  }

  rows(): Locator {
    return this.page
      .getByRole('row')
      .filter({ hasNot: this.page.getByRole('columnheader') });
  }

  /** A row of the table, found by the label of its price. */
  row(label: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByText(label, { exact: true }) });
  }

  addPrice(): Locator {
    return this.page.getByRole('link', { exact: true, name: 'Add price' });
  }

  deprecateButton(label: string): Locator {
    return this.page.getByRole('button', { name: `Deprecate ${label}` });
  }

  // --- The drawer ----------------------------------------------------------------

  drawer(): Locator {
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: 'New price' }),
    });
  }

  amountField(): Locator {
    return this.drawer().getByLabel(/^Amount per unit/);
  }

  labelField(): Locator {
    return this.drawer().getByLabel(/^Label on the invoice/);
  }

  /** The currency: a field to pick from until the version has a price, a locked one after. */
  currencyField(): Locator {
    return this.drawer().locator('[data-field-name="currency"]');
  }

  /** The currency of a version that has a price: a text the form cannot change. */
  lockedCurrency(): Locator {
    return this.currencyField().getByRole('textbox', { name: 'Currency' });
  }

  async chooseCurrency(code: string) {
    await this.currencyField().getByRole('button').click();
    await this.page.getByRole('option', { exact: true, name: code }).click();
    await expect(this.currencyField().getByRole('button')).toHaveText(code);
  }

  periodField(): Locator {
    return this.drawer().getByRole('combobox', { name: /Billing period/ });
  }

  async choosePeriod(label: string) {
    await this.periodField().click();
    await this.page.getByRole('option', { exact: true, name: label }).click();
    await expect(this.page.getByRole('listbox')).toHaveCount(0);
  }

  defaultCheckbox(): Locator {
    return this.drawer().getByRole('checkbox', {
      name: /Default price of this period/,
    });
  }

  createButton(): Locator {
    return this.drawer().getByRole('button', {
      exact: true,
      name: 'Create price',
    });
  }

  /** What the drawer says the amount reads as. */
  livePreview(): Locator {
    return this.drawer().getByText(/^Reads as /);
  }

  // --- The questions -------------------------------------------------------------

  confirmation(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async confirm(label: string) {
    await this.confirmation()
      .getByRole('button', { exact: true, name: label })
      .click();
  }
}
