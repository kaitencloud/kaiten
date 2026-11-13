import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { AiModelsDriver } from '../_support/drivers/ai-models.driver';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { AiUsageDriver } from '../_support/drivers/ai-usage.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from '../ai/ai.scenarios';

// The AI screens as a person who cannot use a mouse or a screen meets them: no
// WCAG A/AA violation on the rate card with its panel open, the instance's AI
// usage, the charge receipt and the model list, in either theme; the receipt and
// the refund dialog keep the focus inside and close on Escape.

test.beforeEach(async ({ page }) => {
  await installAiWorldMocks(page, createAiWorldModels());
});

async function expectAccessibleInBothThemes(
  page: import('@playwright/test').Page,
) {
  await settle(page);
  await expectNoAccessibilityViolations(page);

  await useLightTheme(page);
  await expectNoAccessibilityViolations(page);
}

test.describe('accessibility of the AI screens', () => {
  test('the rate card, with the panel of a cell open', async ({ page }) => {
    const card = new AiRateCardDriver(page);
    await card.goto('?cell=enterprise-v2~claude-sonnet-4-5');
    await expect(card.panel()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the AI usage of an instance', async ({ page }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto('acme-production');
    await expect(usage.feedRow('txn_acme_003')).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the charge receipt and its refund dialog', async ({ page }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto('acme-production');
    await usage.openReceipt('txn_acme_017');
    await expect(usage.section('Refunds')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await usage.receiptButton('Refund 48.50 credits…').click();
    await expectDialogAccessible(page, usage.refundDialog());
  });

  test('the model list', async ({ page }) => {
    const models = new AiModelsDriver(page);
    await models.goto();
    await expect(models.row('Claude Sonnet 4.5')).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });
});
