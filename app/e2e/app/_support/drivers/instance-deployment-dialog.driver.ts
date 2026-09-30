import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The zone picker behind the deploy / migrate action. The same dialog serves
 * both transitions — only its title and confirm label change.
 */
export class InstanceDeploymentDialogDriver {
  constructor(private readonly page: Page) {}

  private dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  zoneSelect(): Locator {
    return this.dialog().getByRole('combobox');
  }

  confirmButton(label: 'Deploy' | 'Migrate'): Locator {
    return this.dialog().getByRole('button', { name: label, exact: true });
  }

  async expectTitle(title: string) {
    await expect(this.dialog().getByText(title, { exact: true })).toBeVisible();
  }

  async expectCurrentZone(zoneLabel: string) {
    await expect(
      this.dialog().getByText(zoneLabel, { exact: true }),
    ).toBeVisible();
  }

  async chooseZone(zoneLabel: string) {
    await this.zoneSelect().click();
    await this.page
      .getByRole('option', { name: zoneLabel, exact: true })
      .click();
  }

  async confirm(label: 'Deploy' | 'Migrate') {
    await this.confirmButton(label).click();
  }

  async expectClosed() {
    await expect(this.dialog()).toHaveCount(0);
  }
}
