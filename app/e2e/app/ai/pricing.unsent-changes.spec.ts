import { expect, test } from '../_support/app-test';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// A rule with unsent changes is kept until the person says to drop it, whatever
// the way out: another cell, the browser's Back, a link elsewhere in the
// console. One dialog for all of them. (`page.goto` is a document load, which
// only raises `beforeunload`: it is not one of the ways out tested here.)

const SONNET = 'enterprise-v2~claude-sonnet-4-5';

test.describe('unsent changes on the rate card', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('another cell asks first; keeping the edit keeps the value', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await card.goto();
    await card.openCell(SONNET);
    await card.rate('Per input token').fill('0.0009');

    await card.cell('enterprise-v2~claude-haiku-4-5').click();
    await expect(card.discardDialog()).toBeVisible();
    await card.keepEditing();
    await card.expectPanelTitle('Claude Sonnet 4.5 · Enterprise 2026');
    await expect(card.rate('Per input token')).toHaveValue('0.0009');

    await card.cell('enterprise-v2~claude-haiku-4-5').click();
    await card.discard();
    await card.expectPanelTitle('Claude Haiku 4.5 · Enterprise 2026');
    await card.expectSearchParam('cell', 'enterprise-v2~claude-haiku-4-5');
    // Nothing was saved.
    await expect(card.cell(SONNET)).toHaveAccessibleName(
      /1\.60 credits for the reference call/,
    );
  });

  test('the browser’s Back asks first, and stays on the rule when kept', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await page.goto('/ai/models');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Models' }),
    ).toBeVisible();
    // In-app, so that Back is the router's and not a document load.
    await page.getByRole('link', { name: 'Pricing', exact: true }).click();
    await expect(card.grid()).toBeVisible();
    await card.openCell(SONNET);
    await card.rate('Per input token').fill('0.0009');

    await page.goBack();
    await expect(card.discardDialog()).toBeVisible();
    await card.keepEditing();
    await expect(card.rate('Per input token')).toHaveValue('0.0009');
    await card.expectSearchParam('cell', SONNET);
  });

  test('a link of the side navigation asks first, and leaves once discarded', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await card.goto();
    await card.openCell(SONNET);
    await card.rate('Per output token').fill('0.004');

    await page.getByRole('link', { name: 'Models', exact: true }).click();
    await expect(card.discardDialog()).toBeVisible();
    await expect(page).toHaveURL(/\/ai\/pricing/);
    await card.discard();

    await expect(page).toHaveURL(/\/ai\/models$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Models' }),
    ).toBeVisible();
  });
});
