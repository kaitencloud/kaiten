import { expect, type Locator, type Page } from '@playwright/test';

export class LicenseDetailDriver {
  constructor(private readonly page: Page) {}

  async goto(slug: string, name: string) {
    await this.page.goto(`/catalog/licenses/${slug}`);
    await expect(
      this.page.getByRole('heading', { name, level: 1 }),
    ).toBeVisible();
  }

  detailsCard(): Locator {
    return this.page
      .locator('[data-slot="card"]')
      .filter({ hasText: 'License details' });
  }

  lifecycleAction(label: string): Locator {
    return this.detailsCard().getByRole('button', { name: label, exact: true });
  }

  async expectState(state: string) {
    await expect(
      this.detailsCard().getByText(state, { exact: true }),
    ).toBeVisible();
  }

  /** The card of the entitlements the version grants. */
  grantsCard(): Locator {
    return this.page
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Entitlements & limits' });
  }

  grantRow(name: string): Locator {
    return this.grantsCard()
      .getByRole('row')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** Edits the threshold of a grant in place, which is saved with Enter. */
  async editThreshold(name: string, shown: string, value: string) {
    await this.grantRow(name).getByRole('button', { name: shown }).click();
    const input = this.grantRow(name).getByRole('textbox', {
      name: 'Threshold / limit',
    });
    await input.fill(value);
    await input.press('Enter');
  }

  async removeGrant(name: string) {
    await this.grantRow(name)
      .getByRole('button', { name: `Remove ${name}` })
      .click();
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Remove', exact: true })
      .click();
  }

  /** Adds a numeric grant through the dialog of the card. */
  async addNumericGrant(name: string, threshold: string) {
    await this.grantsCard()
      .getByRole('button', { name: 'Add entitlement', exact: true })
      .click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('combobox').click();
    await this.page
      .getByRole('option', { name: new RegExp(`^${name}`) })
      .click();
    // A grant starts unlimited: a threshold is typed once that is switched off.
    const unlimited = dialog.getByRole('switch', { name: 'Unlimited' });
    if (await unlimited.isChecked()) {
      await unlimited.click();
    }
    await dialog.locator('#threshold-input').fill(threshold);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  }
}
