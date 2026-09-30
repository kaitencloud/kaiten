import { expect, type Page } from '@playwright/test';

export class FeatureFlagDetailDriver {
  constructor(private readonly page: Page) {}

  async goto(featureFlagSlug: string) {
    await this.page.goto(`/feature-flags/${featureFlagSlug}`);
  }

  async expectLoaded(featureFlagName: string) {
    await expect(
      this.page
        .locator('main')
        .getByText(featureFlagName, { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      this.page.getByRole('tab', { name: 'Overview', exact: true }),
    ).toBeVisible();
  }

  async openConfigure() {
    await this.page.getByRole('link', { name: 'Configure' }).click();
  }

  async openTryIt() {
    await this.page
      .getByRole('button', { name: 'Try it', exact: true })
      .click();
  }

  async openTab(tabName: string) {
    await this.page.getByRole('tab', { name: tabName, exact: true }).click();
  }

  async expectVariantVisible(variantName: string) {
    await expect(
      this.page.getByText(variantName, { exact: true }).first(),
    ).toBeVisible();
  }

  async expectTargetingRuleVisible(ruleName: string) {
    await expect(
      this.page.getByText(ruleName, { exact: true }).first(),
    ).toBeVisible();
  }

  async expectEvaluationSampleVisible(variantName: string) {
    await expect(
      this.page.getByText(variantName, { exact: true }).first(),
    ).toBeVisible();
  }
}
