import { expect, type Locator, type Page } from '@playwright/test';

/** The confirmation every publish, archive and unarchive action asks for. */
export class LicenseLifecycleDialogDriver {
  constructor(private readonly page: Page) {}

  dialog(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async expectTitle(title: string) {
    await expect(
      this.dialog().getByRole('heading', { name: title }),
    ).toBeVisible();
  }

  async confirm(label: string) {
    await this.dialog()
      .getByRole('button', { name: label, exact: true })
      .click();
    await expect(this.dialog()).toHaveCount(0);
  }

  async cancel() {
    await this.dialog().getByRole('button', { name: 'Cancel' }).click();
    await expect(this.dialog()).toHaveCount(0);
  }
}
