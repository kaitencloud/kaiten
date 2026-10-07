import { expect, type Locator, type Page } from '@playwright/test';

/**
 * How a license version is sold: the card of its Overview tab, and the dialog its
 * commercial fields are edited in.
 */
export class LicenseCommercialDriver {
  constructor(private readonly page: Page) {}

  card(): Locator {
    return this.page.locator('[data-slot="card"]').filter({
      has: this.page.getByText('Commercial terms', { exact: true }),
    });
  }

  editLink(): Locator {
    return this.card().getByRole('link', { name: 'Edit', exact: true });
  }

  async open() {
    await this.editLink().click();
    await expect(this.dialog()).toBeVisible();
  }

  dialog(): Locator {
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: 'Edit commercial terms' }),
    });
  }

  pricingType(): Locator {
    return this.dialog()
      .locator('[data-field-name="pricingType"]')
      .getByRole('combobox');
  }

  async choosePricingType(name: 'Free' | 'Paid' | 'Custom') {
    await this.pricingType().click();
    await this.page.getByRole('option', { name, exact: true }).click();
  }

  trial(): Locator {
    return this.dialog().getByRole('textbox', { name: /^Trial length/ });
  }

  paymentMethod(): Locator {
    return this.dialog().getByRole('checkbox', {
      name: /^Require a payment method/,
    });
  }

  ctaUrl(): Locator {
    return this.dialog().getByRole('textbox', { name: /^Call-to-action URL/ });
  }

  save(): Locator {
    return this.dialog().getByRole('button', { name: 'Save', exact: true });
  }

  cancel(): Locator {
    return this.dialog().getByRole('button', { name: 'Cancel', exact: true });
  }

  /** The refusal of the API about what no field explains, above the buttons. */
  problem(): Locator {
    return this.dialog().locator('[data-slot="alert"][data-kind]');
  }

  /** What the card says of one of the commercial fields. */
  field(label: string): Locator {
    return this.card().getByRole('group', { name: label, exact: true });
  }
}
