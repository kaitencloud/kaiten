import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The Integrations entries of the side nav. The section opens by itself on an
 * /integrations page, so its links are on screen there.
 */
export class IntegrationsNavDriver {
  constructor(private readonly page: Page) {}

  entry(label: string): Locator {
    return this.page
      .locator('[data-sidebar="content"]')
      .getByRole('link', { name: label, exact: true });
  }

  async expectEntries(labels: string[]) {
    for (const label of labels) {
      await expect(this.entry(label)).toBeVisible();
    }
  }
}
