import { expect, type Locator, type Page } from '@playwright/test';

export class FeatureFlagTryItDriver {
  constructor(private readonly page: Page) {}

  async fillContext(value: string) {
    await this.contextField().fill(value);
  }

  async evaluate() {
    await this.dialog()
      .getByRole('button', { name: 'Evaluate', exact: true })
      .click();
  }

  async close() {
    await this.dialog()
      .getByRole('button', { name: 'Close', exact: true })
      .first()
      .click();
  }

  async expectError(message: string) {
    await expect(
      this.dialog().getByText(message, { exact: true }),
    ).toBeVisible();
  }

  async expectResultVariant(variantName: string) {
    await expect(
      this.dialog().getByText(variantName, { exact: true }).last(),
    ).toBeVisible();
  }

  async expectEvaluatedValue(value: string) {
    await expect(this.dialog().getByText(value, { exact: true })).toBeVisible();
  }

  private contextField(): Locator {
    return this.dialog().locator('textarea');
  }

  private dialog() {
    return this.page.getByRole('dialog').last();
  }
}
