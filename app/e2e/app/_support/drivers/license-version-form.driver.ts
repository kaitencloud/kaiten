import { expect, type Page } from '@playwright/test';

export class LicenseVersionFormDriver {
  constructor(private readonly page: Page) {}

  async expectLoaded(familyName: string) {
    await expect(
      this.page.getByRole('heading', {
        name: `New version of ${familyName}`,
        level: 1,
      }),
    ).toBeVisible();
  }

  /** The version name the form holds, suggested or typed. */
  async versionName(): Promise<string> {
    return this.page.getByLabel('Version Name', { exact: true }).inputValue();
  }

  async fillVersionName(versionName: string) {
    await this.page
      .getByLabel('Version Name', { exact: true })
      .fill(versionName);
  }

  /** Where billing is on: whether the version starts with the prices of its base. */
  copyPrices() {
    return this.page.getByRole('checkbox', {
      name: 'Copy the prices of the base version',
    });
  }

  async saveAsDraft() {
    await this.page.getByRole('checkbox', { name: 'Save as draft' }).check();
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Create Version' }).click();
  }
}
