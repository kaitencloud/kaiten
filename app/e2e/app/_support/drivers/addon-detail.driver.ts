import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The page of one version of an add-on: its title, its tabs, and the card that says what
 * it is and holds what can be done to it. The tabs have drivers of their own
 * (`AddonGrantsDriver`, `AddonPricesDriver`, `AddonCompatibilityDriver`).
 */
export class AddonDetailDriver {
  constructor(private readonly page: Page) {}

  /** Opens a version by its URL, and waits for the title it is shown under. */
  async goto(slug: string, title: string) {
    await this.page.goto(`/catalog/addons/${slug}`);
    await expect(
      this.page.getByRole('heading', { name: title, level: 1 }),
    ).toBeVisible();
  }

  tab(name: string): Locator {
    return this.page.getByRole('tab', { exact: true, name });
  }

  tabs(): Locator {
    return this.page.getByRole('tab');
  }

  detailsCard(): Locator {
    return this.page
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Add-on details' });
  }

  /** What the card says of the version, by the label of its row. */
  field(label: string): Locator {
    return this.detailsCard()
      .locator('div')
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .last();
  }

  action(label: string): Locator {
    return this.detailsCard().getByRole('button', { exact: true, name: label });
  }

  editLink(): Locator {
    return this.detailsCard().getByRole('link', { exact: true, name: 'Edit' });
  }

  async expectState(state: string) {
    await expect(
      this.detailsCard().getByText(state, { exact: true }),
    ).toBeVisible();
  }

  /** The confirmation every publish, archive, unarchive and deletion asks for. */
  confirmation(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async confirm(label: string) {
    await this.confirmation()
      .getByRole('button', { exact: true, name: label })
      .click();
    await expect(this.confirmation()).toHaveCount(0);
  }
}
