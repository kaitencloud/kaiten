import { expect, type Locator, type Page } from '@playwright/test';

export class FeatureFlagsListDriver {
  constructor(private readonly page: Page) {}

  async goto(search = '') {
    await this.page.goto(`/feature-flags${search}`);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { name: 'Feature Flags' }),
    ).toBeVisible();
  }

  searchField(): Locator {
    return this.page.getByRole('textbox', { name: 'Name', exact: true });
  }

  createLink(): Locator {
    return this.page.getByRole('link', { name: 'New Feature Flag' });
  }

  async openCreatePage() {
    await this.createLink().click();
  }

  async search(term: string) {
    await this.searchField().fill(term);
  }

  async switchToListView() {
    await this.page.getByRole('button', { name: 'List', exact: true }).click();
  }

  async switchToTableView() {
    await this.page.getByRole('button', { name: 'Table', exact: true }).click();
  }

  async openFlag(name: string) {
    await this.tableRow(name).click();
  }

  async openConfigureFromCard(name: string) {
    await this.card(name).getByRole('link', { name: 'Configure' }).click();
  }

  async toggleFromCard(name: string) {
    await this.card(name).getByRole('switch').click();
    // The switch asks before changing the flag for every evaluation.
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^(Enable|Disable)$/ })
      .click();
  }

  async expectFlagVisibleInTable(name: string) {
    await expect(this.tableRow(name)).toBeVisible();
  }

  async expectFlagHiddenInTable(name: string) {
    await expect(this.tableRows(name)).toHaveCount(0);
  }

  async expectFlagVisibleInList(name: string) {
    await expect(this.card(name)).toBeVisible();
  }

  async expectCardStatusVisible(name: string, status: 'Enabled' | 'Disabled') {
    const featureFlagSwitch = this.card(name).getByRole('switch');

    if (status === 'Enabled') {
      await expect(featureFlagSwitch).toBeChecked();
      return;
    }

    await expect(featureFlagSwitch).not.toBeChecked();
  }

  private card(name: string) {
    // Cards expose `data-testid="feature-flag-card"` and a `name` text node.
    // Filtering on testid + exact text node is robust against future DOM
    // tweaks (e.g. wrapper divs added between `<Card>` and the switch).
    return this.page
      .locator('[data-testid="feature-flag-card"]')
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .first();
  }

  private tableRows(name: string) {
    return this.page
      .locator('tbody tr')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  private tableRow(name: string) {
    return this.tableRows(name).first();
  }
}
