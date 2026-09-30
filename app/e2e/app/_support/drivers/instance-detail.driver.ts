import { expect, type Locator, type Page } from '@playwright/test';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class InstanceDetailDriver {
  constructor(private readonly page: Page) {}

  async goto(instanceSlug: string) {
    await this.page.goto(`/customers/instances/${instanceSlug}`);
  }

  async expectLoaded(instanceName: string) {
    await expect(
      this.page
        .locator('main')
        .getByText(instanceName, { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      this.page.getByText('Overview', { exact: true }),
    ).toBeVisible();
  }

  deleteButton(): Locator {
    return this.page.getByRole('button', { name: 'Delete' });
  }

  editButton(): Locator {
    return this.page.getByRole('link', { name: 'Edit', exact: true });
  }

  async startEdit() {
    await this.editButton().click();
  }

  async expectCustomerVisible(customerName: string) {
    await expect(
      this.detailsCard().getByText(customerName, { exact: true }),
    ).toBeVisible();
  }

  async expectLicenseVisible(licenseName: string) {
    await expect(
      this.licenseCard().getByText(licenseName, { exact: true }),
    ).toBeVisible();
  }

  releaseCard(): Locator {
    return this.card('Release');
  }

  deployButton(): Locator {
    return this.releaseCard().getByRole('button', { name: 'Deploy' });
  }

  migrateButton(): Locator {
    return this.releaseCard().getByRole('button', { name: 'Migrate' });
  }

  // Shown in place of the release rows while the instance has no zone.
  releaseEmptyState(): Locator {
    return this.releaseCard().getByText('Not deployed yet', { exact: true });
  }

  async expectDeploymentZoneVisible(zoneName: string) {
    await expect(
      this.releaseCard().getByText(zoneName, { exact: true }),
    ).toBeVisible();
  }

  async expectTabVisible(tabName: string) {
    await expect(
      this.page.getByRole('tab', { name: tabName, exact: true }),
    ).toBeVisible();
  }

  private card(title: string) {
    return this.page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: new RegExp(`^${escapeRegExp(title)}$`) })
      .locator('xpath=ancestor::*[@data-slot="card"][1]')
      .first();
  }

  metadataCard(): Locator {
    return this.card('Metadata');
  }

  async expectMetadataRow(label: string, value: string) {
    const row = this.metadataCard()
      .locator('div')
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .last();
    await expect(row).toContainText(value);
  }

  private detailsCard() {
    return this.card('Instance Details');
  }

  private licenseCard() {
    return this.card('License');
  }
}
