import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The dialog that lists releases with the status each one reads: the one of the
 * components catalog and the one of a deployment zone.
 */
export class ReleasesDialogDriver {
  constructor(private readonly page: Page) {}

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  /** Opens the "N releases" trigger of the only table row that has one. */
  async open(triggerName: string) {
    await this.page.getByRole('button', { name: triggerName }).click();
    await expect(this.dialog()).toBeVisible();
  }

  /** Opens the trigger of the table row that holds `rowText`. */
  async openFromRow(rowText: string, triggerName: string) {
    await this.page
      .locator('tbody tr')
      .filter({ hasText: rowText })
      .getByRole('button', { name: triggerName })
      .click();
    await expect(this.dialog()).toBeVisible();
  }

  releaseRow(version: string): Locator {
    return this.dialog().getByRole('row').filter({ hasText: version });
  }

  async expectStatus(version: string, status: string) {
    await expect(this.releaseRow(version)).toContainText(status);
  }
}
