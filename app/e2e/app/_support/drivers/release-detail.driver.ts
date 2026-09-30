import { expect, type Page } from '@playwright/test';

export class ReleaseDetailDriver {
  constructor(private readonly page: Page) {}

  async expectLoaded(version: string) {
    await expect(
      this.page.getByRole('heading', { name: version, level: 1 }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('tab', { name: 'Overview', exact: true }),
    ).toBeVisible();
  }

  /** The status badge beside the version, then the row of the Overview tab. */
  async expectStatus(status: string) {
    await expect(
      this.page.getByText(status, { exact: true }).first(),
    ).toBeVisible();
    await expect(this.page.getByText(status, { exact: true })).toHaveCount(2);
  }

  async expectLinkedZoneVisible(zoneName: string) {
    await expect(
      this.page.getByText(zoneName, { exact: true }).first(),
    ).toBeVisible();
  }

  async openDeploymentZonesTab() {
    await this.page
      .getByRole('tab', { name: 'Deployment Zones', exact: true })
      .click();
  }
}
