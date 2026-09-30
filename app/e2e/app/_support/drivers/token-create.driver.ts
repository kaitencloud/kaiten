import { expect, type Locator, type Page } from '@playwright/test';

export class TokenCreateDriver {
  constructor(private readonly page: Page) {}

  async goto(serviceAccountSlug: string) {
    await this.page.goto(
      `/integrations/service-accounts/${serviceAccountSlug}/tokens/new`,
    );
    await expect(this.adjustButton()).toBeVisible();
  }

  private adjustButton(): Locator {
    return this.page.getByRole('button', { name: 'Adjust per resource' });
  }

  /**
   * The scope table, in the dialog a viewport under the `tall` breakpoint opens
   * it in: the Desktop Chrome viewport is one.
   */
  async openScopeTable(): Promise<Locator> {
    await this.adjustButton().click();
    const dialog = this.page.getByRole('dialog', {
      name: 'Access per resource',
    });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  scopeRow(table: Locator, resource: string): Locator {
    return table.getByRole('radiogroup', { name: `Access to ${resource}` });
  }
}
