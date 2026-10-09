import { expect, type Locator, type Page } from '@playwright/test';

type AddonValues = {
  description?: string;
  /** Leave the box as it is: a new version is a draft until the person says otherwise. */
  draft?: boolean;
  maxQuantity?: string;
  name?: string;
  pricingType?: 'Custom' | 'Free' | 'Paid';
  slug?: string;
  versionName?: string;
};

/**
 * The dialog a version of an add-on is made or edited in: a new family, the next
 * version of one, or the edit of a version.
 */
export class AddonFormDriver {
  constructor(private readonly page: Page) {}

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async expectOpen(title: string) {
    await expect(
      this.dialog().getByRole('heading', { name: title }),
    ).toBeVisible();
    await expect(this.nameField()).toBeVisible();
  }

  nameField(): Locator {
    return this.dialog().getByLabel(/^Name/);
  }

  slugField(): Locator {
    return this.dialog().getByLabel(/^Slug/);
  }

  descriptionField(): Locator {
    return this.dialog().getByLabel(/^Description/);
  }

  pricingTypeField(): Locator {
    return this.dialog().getByRole('combobox', { name: /Pricing/ });
  }

  versionNameField(): Locator {
    return this.dialog().getByLabel(/^Version name/);
  }

  maxQuantityField(): Locator {
    return this.dialog().getByLabel(/^Maximum quantity/);
  }

  draftCheckbox(): Locator {
    return this.dialog().getByRole('checkbox', { name: /Create as a draft/ });
  }

  /** Makes the version: the button of a new one, or the one that saves an edit. */
  submitButton(): Locator {
    return this.dialog().getByRole('button', {
      name: /^(Create add-on|Save)$/,
    });
  }

  async chooseOption(field: Locator, name: string) {
    await field.click();
    await this.page.getByRole('option', { exact: true, name }).click();
    await expect(this.page.getByRole('listbox')).toHaveCount(0);
  }

  async fill(values: AddonValues) {
    if (values.name !== undefined) {
      await this.nameField().fill(values.name);
    }
    if (values.slug !== undefined) {
      await this.slugField().fill(values.slug);
    }
    if (values.description !== undefined) {
      await this.descriptionField().fill(values.description);
    }
    if (values.pricingType !== undefined) {
      await this.chooseOption(this.pricingTypeField(), values.pricingType);
    }
    if (values.versionName !== undefined) {
      await this.versionNameField().fill(values.versionName);
    }
    if (values.maxQuantity !== undefined) {
      await this.maxQuantityField().fill(values.maxQuantity);
    }
    if (values.draft === false) {
      await this.draftCheckbox().uncheck();
    }
  }

  async submit() {
    await this.submitButton().click();
  }
}
