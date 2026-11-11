import { expect, recordWrites, test } from '../_support/app-test';
import { AiUsageDriver } from '../_support/drivers/ai-usage.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// The AI usage tab of an instance: the balance of each pool, the notice of a
// pool past its own warning threshold, and the inference feed, whose filters
// are in the URL and are sent to the API.

const FEED =
  /^\/api\/instances\/acme-production\/entitlements\/ai-credits\/usage\/inferences$/;

test.describe('the AI usage of an instance', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('shows the balance of the pool', async ({ page }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto('acme-production');

    await expect(
      page.getByRole('heading', { level: 3, name: 'AI credits' }),
    ).toBeVisible();
    await expect(usage.poolFigure('Available to reserve')).toHaveText(
      '90,329.00',
    );
    await expect(usage.poolFigure('Consumed')).toHaveText('183,420.50');
    await expect(usage.poolFigure('Included')).toHaveText('250,000');
    await expect(usage.poolFigure('Maximum allowed')).toHaveText('275,000');
    await expect(usage.feedRow('txn_acme_003')).toContainText('1.38');
  });

  test('sends the feed’s filters to the API, and keeps them in the URL', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto('acme-production');
    const reads = recordWrites(page, FEED, ['GET']);

    await usage.chooseFilter('Authorization', 'Not authorized');
    await usage.chooseFilter('Request type', 'Completion');

    await expect(usage.feedRow('txn_acme_008')).toBeVisible();
    await expect(usage.feedRow('txn_acme_003')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]auth=no/);
    await expect(page).toHaveURL(/[?&]type=COMPLETION/);
    await expect
      .poll(() => {
        const last = reads.at(-1);
        return last ? Object.fromEntries(new URLSearchParams(last.search)) : {};
      })
      .toMatchObject({ authorized: 'false', requestType: 'COMPLETION' });
  });

  test('warns at the pool’s own threshold (80 % on Globex Production)', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto('globex-production');

    await expect(usage.poolFigure('Consumed')).toHaveText('4,272.40');
    await expect(page.getByRole('main')).toContainText(
      'Consumption has reached this pool’s warning threshold: 80 % of the included credits (4,000).',
    );
  });

  test('does not warn below the pool’s threshold (86 % of a pool whose threshold is 90 %)', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto('acme-us', '?pool=partner-ai-credits');

    await expect(
      page.getByRole('combobox', { name: 'Credit pool' }),
    ).toContainText('Partner AI credits');
    await expect(usage.poolFigure('Consumed')).toHaveText('17,200.00');
    await expect(page.getByRole('main')).toContainText('86% of included');
    await expect(page.getByRole('main')).not.toContainText('warning threshold');
  });
});
