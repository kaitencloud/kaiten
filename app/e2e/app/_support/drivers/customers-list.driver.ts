import { expect, type Locator, type Page } from '@playwright/test';

export class CustomersListDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/customers');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { name: 'Customers' }),
    ).toBeVisible();
  }

  searchField(): Locator {
    return this.page.getByRole('textbox', { name: 'Name', exact: true });
  }

  createLink(): Locator {
    return this.page.getByRole('link', { name: 'New Customer' });
  }

  private customerRows(name: string): Locator {
    return this.page
      .locator('tbody tr')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  customerRow(name: string): Locator {
    return this.customerRows(name).first();
  }

  deleteAction(name: string): Locator {
    return this.customerRow(name).getByRole('button').last();
  }

  async openCreateDialog() {
    await this.createLink().click();
  }

  async search(term: string) {
    await this.searchField().fill(term);
  }

  async expectCustomerVisible(name: string) {
    await expect(this.customerRow(name)).toBeVisible();
  }

  async expectCustomerHidden(name: string) {
    await expect(this.customerRows(name)).toHaveCount(0);
  }

  async openCustomer(name: string) {
    await this.customerRow(name).click();
  }

  async openDeleteDialog(name: string) {
    await this.deleteAction(name).click();
  }
}
