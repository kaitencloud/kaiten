import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The Entitlements tab of an add-on version: what one unit of quantity grants, and the
 * dialog a grant is given or changed in. The dialog is a route over the tab
 * (`?grant=new`, `?grant=<entitlement>`).
 */
export class AddonGrantsDriver {
  constructor(private readonly page: Page) {}

  async goto(slug: string, title: string) {
    await this.page.goto(`/addons/${slug}/entitlements`);
    await expect(
      this.page.getByRole('heading', { name: title, level: 1 }),
    ).toBeVisible();
    await expect(this.card()).toBeVisible();
  }

  card(): Locator {
    return this.page
      .locator('[data-slot="card"]')
      .filter({ has: this.page.getByRole('table') });
  }

  row(name: string): Locator {
    return this.card()
      .getByRole('row')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** The call to give the version a grant: a link, since the dialog is in the URL. */
  addLink(): Locator {
    return this.page.getByRole('link', {
      exact: true,
      name: 'Add entitlement',
    });
  }

  editLink(name: string): Locator {
    return this.row(name).getByRole('link', { name: `Edit ${name}` });
  }

  removeButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: `Remove ${name}` });
  }

  // --- The dialog ----------------------------------------------------------------

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  entitlementField(): Locator {
    return this.dialog().getByRole('combobox', { name: /^Entitlement/ });
  }

  async chooseEntitlement(name: string) {
    await this.entitlementField().click();
    await this.page.getByRole('option', { exact: true, name }).click();
    await expect(this.page.getByRole('listbox')).toHaveCount(0);
  }

  valueField(): Locator {
    return this.dialog().getByLabel(/^Value per unit/);
  }

  unlimitedCheckbox(): Locator {
    return this.dialog().getByRole('checkbox', { name: 'Unlimited' });
  }

  behaviorField(): Locator {
    return this.dialog().getByRole('combobox', {
      name: /Combines with the license/,
    });
  }

  async chooseBehavior(label: string) {
    await this.behaviorField().click();
    await this.page.getByRole('option', { exact: true, name: label }).click();
    await expect(this.page.getByRole('listbox')).toHaveCount(0);
  }

  overageField(): Locator {
    return this.dialog().getByLabel(/^Overage allowance/);
  }

  /** What is said when the overage of the grant is lower than a license's. */
  overageWarning(): Locator {
    return this.dialog().getByTestId('license-overage-warning');
  }

  /** The button that gives the grant, or the one that saves an edit. */
  submitButton(): Locator {
    return this.dialog().getByRole('button', {
      name: /^(Add entitlement|Save entitlement)$/,
    });
  }

  // --- Taking a grant away -------------------------------------------------------

  confirmation(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async confirmRemoval() {
    await this.confirmation()
      .getByRole('button', { exact: true, name: 'Remove' })
      .click();
  }
}
