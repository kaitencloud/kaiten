import { expect, type Locator, type Page } from '@playwright/test';

/**
 * AI › Models (`/ai/models`): the catalogue of models, its search and status
 * filter, the count of rules that name each model, and the dialog a deletion
 * opens, which offers Archive when a rule names the model.
 */
export class AiModelsDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/ai/models');
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Models' }),
    ).toBeVisible();
  }

  async search(text: string) {
    await this.page
      .getByRole('searchbox', { name: 'Search models' })
      .fill(text);
  }

  async chooseStatus(status: string) {
    await this.page.getByRole('combobox', { name: 'Status' }).click();
    await this.page.getByRole('option', { name: status, exact: true }).click();
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({
      has: this.page.getByRole('button', { name: `Delete ${name}` }),
    });
  }

  rulesLink(name: string): Locator {
    return this.row(name).getByRole('button', {
      name: new RegExp(`^Open the rate card on ${name}:`),
    });
  }

  async delete(name: string) {
    await this.page.getByRole('button', { name: `Delete ${name}` }).click();
    await expect(this.removalDialog()).toBeVisible();
  }

  removalDialog(): Locator {
    return this.page.getByRole('alertdialog');
  }
}
