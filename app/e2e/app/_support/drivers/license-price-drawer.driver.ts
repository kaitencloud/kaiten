import { expect, type Locator, type Page } from '@playwright/test';

type PriceModel = 'Flat fee' | 'Usage-based' | 'Overage';

/**
 * The drawer a price is added or edited in. It is the form of one price: its
 * shape and timing, what it meters, what it charges, and the refusal of the API
 * above its buttons.
 */
export class LicensePriceDrawerDriver {
  constructor(private readonly page: Page) {}

  root(): Locator {
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: /^(New|Edit) price$/ }),
    });
  }

  async expectOpen(title: 'New price' | 'Edit price') {
    await expect(
      this.root().getByRole('heading', { name: title }),
    ).toBeVisible();
  }

  async expectClosed() {
    await expect(this.root()).toHaveCount(0);
  }

  // --- Shape and timing ------------------------------------------------------

  private choices(group: 'Shape' | 'Billing timing'): Locator {
    return this.root().getByRole('group', { name: group, exact: true });
  }

  /** One of the three shapes, a button that is pressed once chosen. */
  model(name: PriceModel): Locator {
    return this.choices('Shape').getByRole('button', {
      name: new RegExp(`^${name}`),
    });
  }

  async chooseModel(name: PriceModel) {
    await this.model(name).click();
    await expect(this.model(name)).toHaveAttribute('aria-pressed', 'true');
  }

  timing(name: 'In advance' | 'In arrears'): Locator {
    return this.choices('Billing timing').getByRole('button', {
      name: new RegExp(`^${name}`),
    });
  }

  // --- What it meters --------------------------------------------------------

  /** The group of choices of what a metered price measures. */
  picker(): Locator {
    return this.root().getByRole('group', { name: /^Metered entitlement/ });
  }

  /** An option of the picker, found by the name of its entitlement. */
  meterOption(name: string): Locator {
    return this.picker().getByRole('button', { name: new RegExp(`^${name}`) });
  }

  /**
   * The entitlements the picker lists, in the order it lists them: the first line
   * of each option, where the lines under it say what it is.
   */
  async meterOptions(): Promise<string[]> {
    return this.picker()
      .getByRole('button')
      .evaluateAll((options) =>
        options.map((option) =>
          (option as HTMLElement).innerText.split('\n')[0].trim(),
        ),
      );
  }

  async chooseMeter(name: string) {
    await this.meterOption(name).click();
    await expect(this.meterOption(name)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  /** What the picker says of a stock, which it lists but does not offer. */
  stockHint(): Locator {
    return this.root().getByText(/is sold as an add-on/);
  }

  // --- Fields ----------------------------------------------------------------

  amount(): Locator {
    return this.root().getByRole('textbox', { name: /^Amount/ });
  }

  label(): Locator {
    return this.root().getByRole('textbox', { name: /^Label on the invoice/ });
  }

  /** The period of a flat fee: a select, which a metered price does not have. */
  period(): Locator {
    return this.root()
      .locator('[data-field-name="billingPeriod"]')
      .getByRole('combobox');
  }

  async choosePeriod(name: string) {
    await this.period().click();
    await this.page.getByRole('option', { name, exact: true }).click();
  }

  /** The currency: a field to pick from until the version has a price, a locked one after. */
  currency(): Locator {
    return this.root().locator('[data-field-name="currency"]');
  }

  isDefault(): Locator {
    return this.root().getByRole('checkbox', {
      name: /^Default price of this period/,
    });
  }

  /** What the form says the price reads as, once it has an amount. */
  livePreview(): Locator {
    return this.root().getByText(/^Reads as /);
  }

  // --- Buttons ---------------------------------------------------------------

  submit(name: 'Create price' | 'Save price'): Locator {
    return this.root().getByRole('button', { name, exact: true });
  }

  cancel(): Locator {
    return this.root().getByRole('button', { name: 'Cancel', exact: true });
  }

  /** The refusal of the API, above the buttons, with its explanation. */
  problem(): Locator {
    return this.root().getByRole('alert');
  }
}
