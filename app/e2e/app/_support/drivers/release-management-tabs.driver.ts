import { expect, type Page } from '@playwright/test';

export class ReleaseManagementTabsDriver {
  constructor(private readonly page: Page) {}

  async expectVisible() {
    await expect(this.tabLink('/releases')).toBeVisible();
    await expect(this.tabLink('/releases/components')).toBeVisible();
    await expect(this.tabLink('/releases/deployment-zones')).toBeVisible();
  }

  async openComponents() {
    await this.tabLink('/releases/components').click();
  }

  async openDeploymentZones() {
    await this.tabLink('/releases/deployment-zones').click();
  }

  async openReleases() {
    await this.tabLink('/releases').click();
  }

  private tabLink(href: string) {
    return this.page.locator('main').locator(`a[href="${href}"]`).last();
  }
}
