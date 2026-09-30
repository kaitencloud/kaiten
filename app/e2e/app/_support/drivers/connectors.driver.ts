import { expect, type Locator, type Page } from '@playwright/test';

export class ConnectorsDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/integrations/connectors');
    await expect(
      this.page.getByRole('heading', { name: 'Connectors' }),
    ).toBeVisible();
  }

  connectButton(): Locator {
    return this.page
      .getByRole('button', { name: 'Connect' })
      .filter({ visible: true })
      .and(this.page.locator(':enabled'))
      .first();
  }

  async openWizard() {
    await this.connectButton().click();
    await expect(
      this.page.getByRole('heading', {
        name: 'Connect to your Attio workspace',
      }),
    ).toBeVisible();
  }

  async connect(token: string) {
    await this.page.getByPlaceholder(/atk_live_/).fill(token);
    await this.page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      this.page.getByRole('heading', { name: 'Map Kaiten data to Attio' }),
    ).toBeVisible();
    await this.page.getByRole('button', { name: 'Finish' }).click();
  }

  async expectDetail() {
    await expect(this.page).toHaveURL(/\/integrations\/connectors\/attio$/);
    await expect(
      this.page.getByRole('button', { name: 'Disconnect' }),
    ).toBeVisible();
  }

  async disconnect() {
    await this.page.getByRole('button', { name: 'Disconnect' }).click();
    const dialog = this.page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Disconnect' }).click();
  }
}
