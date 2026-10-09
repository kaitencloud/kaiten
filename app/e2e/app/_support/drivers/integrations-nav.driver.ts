import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The Integrations entries of the side nav. The section opens by itself on an
 * /integrations page, so its links are on screen there.
 */
export class IntegrationsNavDriver {
  constructor(private readonly page: Page) {}

  /** The toggle of the section, which is closed anywhere but on a page of it. */
  section(): Locator {
    return this.page
      .locator('[data-sidebar="content"]')
      .getByRole('button', { name: 'Integrations', exact: true });
  }

  async open() {
    const section = this.section();
    await expect(section).toBeVisible();
    if ((await section.getAttribute('aria-expanded')) !== 'true') {
      await section.click();
    }
  }

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
