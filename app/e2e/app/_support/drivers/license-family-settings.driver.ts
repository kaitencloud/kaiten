import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The settings of a family of licenses: the link on its row of the list, and the
 * dialog they are edited in, which the URL opens (`?familySettings=<slug>`).
 */
export class LicenseFamilySettingsDriver {
  constructor(private readonly page: Page) {}

  /** The link on the row of the family, found by the name it is shown under. */
  link(familyName: string): Locator {
    return this.page.getByRole('link', {
      name: `Settings of ${familyName}`,
      exact: true,
    });
  }

  async open(familyName: string) {
    await this.link(familyName).click();
    await expect(this.dialog()).toBeVisible();
  }

  dialog(): Locator {
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: 'License settings' }),
    });
  }

  fallback(): Locator {
    return this.dialog()
      .locator('[data-field-name="fallbackLicenseFamilySlug"]')
      .getByRole('combobox');
  }

  trialEnd(): Locator {
    return this.dialog()
      .locator('[data-field-name="trialEndWithoutPaymentMethod"]')
      .getByRole('combobox');
  }

  reminder(): Locator {
    return this.dialog().getByRole('textbox', { name: /^Trial reminder/ });
  }

  /** The words under a field: its help, or the refusal that replaced it. */
  field(name: string): Locator {
    return this.dialog().locator(`[data-field-name="${name}"]`);
  }

  async choose(trigger: Locator, option: string) {
    await trigger.click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  /** The options a select lists, in order, with the select left closed. */
  async options(trigger: Locator): Promise<string[]> {
    await trigger.click();
    const labels = await this.page
      .getByRole('option')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
    await this.page.keyboard.press('Escape');

    return labels;
  }

  save(): Locator {
    return this.dialog().getByRole('button', {
      name: 'Save settings',
      exact: true,
    });
  }

  cancel(): Locator {
    return this.dialog().getByRole('button', { name: 'Cancel', exact: true });
  }
}
