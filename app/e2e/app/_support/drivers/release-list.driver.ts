import { expect, type Locator, type Page } from '@playwright/test';

export type ReleaseStatusLabel =
  | 'Deployed'
  | 'Planned'
  | 'Staging'
  | 'Superseded';

/** The same four labels, as the French console prints them. */
export type FrenchReleaseStatusLabel =
  | 'Déployée'
  | 'En staging'
  | 'Planifiée'
  | 'Remplacée';

/** The table of releases of `/releases` and `/releases/deployments`. */
export class ReleaseListDriver {
  constructor(private readonly page: Page) {}

  async gotoReleases() {
    await this.page.goto('/releases');
    await this.expectLoaded();
  }

  async gotoDeployments() {
    await this.page.goto('/releases/deployments');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page.locator('tbody tr').first()).toBeVisible();
  }

  releaseRow(version: string): Locator {
    return this.page
      .locator('tbody tr')
      .filter({ has: this.page.getByText(version, { exact: true }) })
      .first();
  }

  async expectStatus(
    version: string,
    status: ReleaseStatusLabel | FrenchReleaseStatusLabel,
  ) {
    await expect(this.releaseRow(version)).toContainText(status);
  }

  /** The card that counts the releases in one status: its label, then a number. */
  async expectStatCount(label: string, count: number) {
    await expect(
      this.page.locator('[data-slot="stat-card"]').filter({
        has: this.page.locator('[data-slot="stat-card-label"]', {
          hasText: new RegExp(`^${label}$`),
        }),
      }),
    ).toHaveText(new RegExp(`^${label}\\s*${count}$`));
  }

  /** The row's delete action, then the confirmation of the alert dialog. */
  async deleteRelease(version: string) {
    await this.releaseRow(version)
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(this.page.getByRole('alertdialog')).toBeVisible();
    await this.page.getByRole('button', { name: 'Confirm' }).click();
  }

  /** Opens the Status filter: its option list replaces the field menu. */
  async openStatusFilter() {
    await this.page
      .getByRole('button', { name: 'Filter', exact: true })
      .click();
    await this.page
      .getByRole('dialog')
      .getByRole('option', { name: 'Status', exact: true })
      .click();
  }

  statusFilterOptions(): Locator {
    return this.page.getByRole('dialog').getByRole('option');
  }

  async chooseStatusFilterOption(label: 'All' | ReleaseStatusLabel) {
    await this.page
      .getByRole('dialog')
      .getByRole('option', { name: label, exact: true })
      .click();
  }

  async expectVersions(versions: string[]) {
    await expect(this.page.locator('tbody tr')).toHaveCount(versions.length);

    for (const version of versions) {
      await expect(this.releaseRow(version)).toBeVisible();
    }
  }
}
