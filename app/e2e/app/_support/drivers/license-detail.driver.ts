import { expect, type Locator, type Page } from '@playwright/test';

export class LicenseDetailDriver {
  constructor(private readonly page: Page) {}

  async goto(slug: string, name: string) {
    await this.page.goto(`/licenses/${slug}`);
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
}
