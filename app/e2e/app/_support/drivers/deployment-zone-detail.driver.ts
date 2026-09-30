import { expect, type Page } from '@playwright/test';

export class DeploymentZoneDetailDriver {
  constructor(private readonly page: Page) {}

  async expectCurrentReleaseVisible(version: string) {
    await expect(
      this.page.getByText(version, { exact: true }).first(),
    ).toBeVisible();
  }

  async expectDescriptionVisible(description: string) {
    await expect(
      this.page.getByText(description, { exact: true }).first(),
    ).toBeVisible();
  }

  async expectLoaded(zoneName: string) {
    await expect(
      this.page.getByRole('heading', { name: zoneName, level: 1 }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('tab', { name: 'Overview', exact: true }),
    ).toBeVisible();
  }

  async openPeersTab() {
    await this.page.getByRole('tab', { name: 'Peers', exact: true }).click();
  }

  async expectPeerZoneVisible(zoneName: string) {
    await expect(
      this.page.getByText(zoneName, { exact: true }).first(),
    ).toBeVisible();
  }
}
