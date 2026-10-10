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

  /** A row of the card of the customer's details by its label: the row, which holds its value. */
  detailsRow(label: string): Locator {
    return this.page
      .locator('main')
      .locator('div')
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .last();
  }

  /** The card of the invoices of the customer: absent where billing is. Its title is the language the page is read in. */
  invoicesCard(title = 'Invoices'): Locator {
    return this.page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: new RegExp(`^${title}$`) })
      .locator('xpath=ancestor::*[@data-slot="card"][1]')
      .first();
  }

  /** The rows of the card of the invoices of the customer. */
  invoiceRows(title?: string): Locator {
    return this.invoicesCard(title)
      .getByRole('row')
      .filter({ hasNot: this.page.getByRole('columnheader') });
  }

  invoicesEmpty(): Locator {
    return this.page.getByTestId('customer-invoices-empty');
  }

  invoicesError(): Locator {
    return this.page.getByTestId('customer-invoices-error');
  }

  loadMoreInvoices(): Locator {
    return this.invoicesCard().getByRole('button', { name: 'Load more' });
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

  /** The card of the customer's instances, by its title. */
  instancesCard(): Locator {
    return this.page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: /^Instances$/ })
      .locator('xpath=ancestor::*[@data-slot="card"][1]')
      .first();
  }

  /** The header of the Billing column of the card of the instances, absent where billing is not shown. */
  instancesBillingHeader(): Locator {
    return this.instancesCard().getByRole('columnheader', { name: 'Billing' });
  }

  /** The badge of the Billing column for an instance of the card. */
  instanceBillingBadge(instanceName: string): Locator {
    return this.instancesCard()
      .getByRole('row')
      .filter({ has: this.page.getByText(instanceName, { exact: true }) })
      .locator('[data-status]');
  }

  /** What the Billing column says of an instance nobody ever subscribed. */
  instanceNotSubscribed(instanceName: string): Locator {
    return this.instancesCard()
      .getByRole('row')
      .filter({ has: this.page.getByText(instanceName, { exact: true }) })
      .getByText('Not subscribed');
  }

  async expectInstanceVisible(instanceName: string) {
    await expect(
      this.page.getByText(instanceName, { exact: true }),
    ).toBeVisible();
  }
}
