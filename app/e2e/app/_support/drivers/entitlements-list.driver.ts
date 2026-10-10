import { expect, type Locator, type Page } from '@playwright/test';

export class EntitlementsListDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/catalog/entitlements');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { name: 'Entitlements' }),
    ).toBeVisible();
  }

  createLink(): Locator {
    return this.page.getByRole('link', { name: 'New Entitlement' });
  }

  searchField(): Locator {
    return this.page.getByRole('textbox', { name: 'Name', exact: true });
  }

  private entitlementRows(name: string): Locator {
    return this.page
      .locator('tbody tr')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  entitlementRow(name: string): Locator {
    return this.entitlementRows(name).first();
  }

  deleteAction(name: string): Locator {
    return this.entitlementRow(name).getByRole('button', { name: 'Delete' });
  }

  async search(term: string) {
    await this.searchField().fill(term);
  }

  async openCreatePage() {
    await this.createLink().click();
  }

  async openEntitlement(name: string) {
    await this.entitlementRow(name).click();
  }

  async openDeleteDialog(name: string) {
    await this.deleteAction(name).click();
  }

  async expectEntitlementVisible(name: string) {
    await expect(this.entitlementRow(name)).toBeVisible();
  }

  async expectEntitlementHidden(name: string) {
    await expect(this.entitlementRows(name)).toHaveCount(0);
  }
}
