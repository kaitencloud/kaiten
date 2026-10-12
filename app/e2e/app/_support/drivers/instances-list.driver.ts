import { expect, type Locator, type Page } from '@playwright/test';

export class InstancesListDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/customers/instances');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { name: 'Instances' }),
    ).toBeVisible();
  }

  /** The headers of the table, in order. */
  columnHeaders(): Locator {
    return this.page.getByRole('columnheader');
  }

  /** The header of the Billing column, absent where billing is not shown. */
  billingHeader(): Locator {
    return this.page.getByRole('columnheader', { name: 'Billing' });
  }

  /**
   * The badge of the Billing column of an instance. It is told from the others of the
   * row by the status it carries, which is the API's: `TRIAL`, `ACTIVE`, `PAST_DUE`,
   * `CANCELED`.
   */
  billingBadge(name: string): Locator {
    return this.instanceRow(name).locator('[data-status]');
  }

  /** What the Billing column says of an instance nobody ever subscribed: a dash, which a screen reader reads as this. */
  notSubscribed(name: string, text = 'Not subscribed'): Locator {
    return this.instanceRow(name).getByText(text);
  }

  /** The placeholders that hold the place of the badges while the subscriptions are read. */
  billingPlaceholders(): Locator {
    return this.page.getByTestId('billing-cell-pending');
  }

  searchField(): Locator {
    return this.page.getByRole('textbox', { name: 'Name', exact: true });
  }

  createLink(): Locator {
    return this.page.getByRole('link', { name: 'New Instance' });
  }

  private instanceRows(name: string): Locator {
    return this.page
      .locator('tbody tr')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  instanceRow(name: string): Locator {
    return this.instanceRows(name).first();
  }

  deleteAction(name: string): Locator {
    return this.instanceRow(name).getByRole('button', { name: 'Delete' });
  }

  // One control, two labels: an orphan instance is deployed, a deployed one is
  // migrated.
  deployAction(name: string): Locator {
    return this.instanceRow(name).getByRole('button', { name: 'Deploy' });
  }

  migrateAction(name: string): Locator {
    return this.instanceRow(name).getByRole('button', { name: 'Migrate' });
  }

  async openCreateDialog() {
    await this.createLink().click();
  }

  async search(term: string) {
    await this.searchField().fill(term);
  }

  async openInstance(name: string) {
    await this.instanceRow(name).click();
  }

  async openDeleteDialog(name: string) {
    await this.deleteAction(name).click();
  }

  async openDeployDialog(name: string) {
    await this.deployAction(name).click();
  }

  async openMigrateDialog(name: string) {
    await this.migrateAction(name).click();
  }

  /** Waits for the rows of the list: what a spec counts the requests of the page after. */
  async expectRowsLoaded() {
    await expect(this.page.locator('tbody tr').first()).toBeVisible();
  }

  async expectInstanceVisible(name: string) {
    await expect(this.instanceRow(name)).toBeVisible();
  }

  async expectInstanceHidden(name: string) {
    await expect(this.instanceRows(name)).toHaveCount(0);
  }
}
