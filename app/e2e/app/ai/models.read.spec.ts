import { expect, test } from '../_support/app-test';
import { AiModelsDriver } from '../_support/drivers/ai-models.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// The list of models: its vendor cost, the count of active rules that name a
// model, which links to the rate card on it, and the status filter.

test.describe('the model list', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('shows the vendor cost and the rules that name a model', async ({
    page,
  }) => {
    const models = new AiModelsDriver(page);
    await models.goto();

    await expect(models.row('Claude Sonnet 4.5')).toContainText(
      '$3 in · $15 out / 1M tokens',
    );
    await expect(models.rulesLink('Claude Sonnet 4.5')).toHaveAccessibleName(
      'Open the rate card on Claude Sonnet 4.5: 6 rules name it',
    );
    await expect(models.rulesLink('Claude Haiku 4.5')).toContainText('No rule');
  });

  test('filters by status, and opens the rate card on a model’s rules', async ({
    page,
  }) => {
    const models = new AiModelsDriver(page);
    await models.goto();

    await models.chooseStatus('Archived');
    await expect(models.row('Whisper large v3')).toBeVisible();
    await expect(models.row('Claude Sonnet 4.5')).toHaveCount(0);

    await models.chooseStatus('All statuses');
    await models.rulesLink('Claude Sonnet 4.5').click();
    await expect(page).toHaveURL(/\/ai\/pricing\?q=claude-sonnet-4-5/);
    await expect(page.getByRole('table', { name: /^Rate card/ })).toBeVisible();
  });
});
