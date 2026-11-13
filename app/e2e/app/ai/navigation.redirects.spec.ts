import { expect, test } from '../_support/app-test';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// The old AI URLs keep working: the conversion matrix opens the rate card on
// the same pool and version, the models moved from Catalog to AI with their
// parameters, the Calculation tab of a pool became its Pricing tab, and `/ai`
// opens Pricing. The Pricing tab of a pool sends to the rate card on a version.

test.describe('AI navigation and old URLs', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('the AI section lists Pricing and Models, and /ai opens Pricing', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await page.goto('/ai');

    await expect(page).toHaveURL(/\/ai\/pricing$/);
    await expect(card.heading()).toBeVisible();
    await page.getByRole('link', { name: 'Models', exact: true }).click();
    await expect(page).toHaveURL(/\/ai\/models$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Models' }),
    ).toBeVisible();
  });

  test('the conversion matrix opens the rate card on the same pool and version', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await page.goto(
      '/ai/matrix?entitlementSlug=partner-ai-credits&licenseSlug=business',
    );

    await expect(page).toHaveURL(/\/ai\/pricing\?/);
    await card.expectSearchParam('pool', 'partner-ai-credits');
    await card.expectSearchParam('version', 'business');
    await expect(
      page.getByRole('combobox', { name: 'Credit pool' }),
    ).toContainText('Partner AI credits');
  });

  test('the models under Catalog open under AI, with their parameters', async ({
    page,
  }) => {
    await page.goto('/catalog/models');
    await expect(page).toHaveURL(/\/ai\/models$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Models' }),
    ).toBeVisible();

    await page.goto(
      '/catalog/models/claude-sonnet-4-5/edit?entitlementSlug=ai-credits',
    );
    await expect(page).toHaveURL(
      /\/ai\/models\/claude-sonnet-4-5\/edit\?entitlementSlug=ai-credits$/,
    );
  });

  test('the Calculation tab of a pool is now its Pricing tab, which opens the rate card on a version', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await page.goto(
      '/catalog/entitlements/ai-credits/calculation?licenseSlug=enterprise-v2',
    );

    await expect(page).toHaveURL(
      /\/catalog\/entitlements\/ai-credits\/pricing\?version=enterprise-v2$/,
    );
    await expect(page.getByRole('tab', { name: 'Pricing' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const versions = page.getByRole('region', {
      name: 'Pricing of this pool per licence version',
    });
    await expect(
      versions.getByRole('row', { name: /^Enterprise · 2026 enterprise-v2/ }),
    ).toContainText('250,000');

    await versions
      .getByRole('button', { name: 'Open Enterprise · 2026 in the rate card' })
      .click();
    await expect(page).toHaveURL(/\/ai\/pricing\?/);
    await card.expectSearchParam('pool', 'ai-credits');
    await expect(card.grid()).toBeVisible();
  });
});
