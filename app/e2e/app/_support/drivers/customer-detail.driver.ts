import { expect, type Locator, type Page } from '@playwright/test';

export class CustomerDetailDriver {
  constructor(private readonly page: Page) {}

  async goto(customerSlug: string) {
    await this.page.goto(`/customers/${customerSlug}`);
  }

  async expectLoaded(customerName: string) {
    await expect(
      this.page
        .locator('main')
        .getByText(customerName, { exact: true })
        .first(),
    ).toBeVisible();
    await expect(this.page.getByText('Customer details')).toBeVisible();
  }

  editButton(): Locator {
    return this.page.getByRole('link', { name: 'Edit', exact: true });
  }

  deleteButton(): Locator {
    return this.page.getByRole('button', { name: 'Delete' });
  }

  createInstanceButton(): Locator {
    return this.page.getByRole('button', { name: 'New Instance' });
  }

  async startEdit() {
    await this.editButton().click();
  }

  async openCreateInstanceDialog() {
    await this.createInstanceButton().click();
  }

  /** Back to the list through the breadcrumb: a client-side navigation, so
   * whatever the page started (an Attio sync watcher) keeps running. */
  async backToList() {
    await this.page
      .getByRole('navigation', { name: 'breadcrumb' })
      .getByRole('link', { name: 'Customers', exact: true })
      .click();
  }

  /** The value of the Attio card's "Sync status" row. */
  attioSyncStatus(status: 'In progress' | 'Synced'): Locator {
    return this.page.getByText(status, { exact: true });
  }

  async expectInstanceVisible(instanceName: string) {
    await expect(
      this.page.getByText(instanceName, { exact: true }),
    ).toBeVisible();
  }
}
