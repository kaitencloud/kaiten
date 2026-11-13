import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// Editing the rule a cell shows: the write sends what changed, and the cell
// reprices the reference call. In the mock world a successful write refreshes
// the platform flags and the AI screens mount again, so each test waits on the
// state it ends in, never on what is drawn in between.

const RULE_WRITES = /^\/api\/licenses\/[^/]+\/conversion-rules(\/[^/]+)?$/;

test.describe('editing a rule on the rate card', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('saves a new input rate, and the cell shows the new price', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    const writes = recordWrites(page, RULE_WRITES);
    await card.goto();

    await card.openCell('enterprise-v2~claude-sonnet-4-5');
    await card.rate('Per input token').fill('0.0006');
    // The preview reprices the reference call before anything is sent:
    // 1,500 × 0.0006 + 500 × 0.002.
    await expect(card.panel()).toContainText('1.60 → 1.90');
    await card.submit('Save rule');

    await expectToast(page, 'Rule saved');
    await expect(
      card.cell('enterprise-v2~claude-sonnet-4-5'),
    ).toHaveAccessibleName(
      /^Claude Sonnet 4\.5 on Enterprise: 1\.90 credits for the reference call, .*Own rule$/,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      body: {
        maximumCreditsPerRequest: '250',
        minimumCreditsPerRequest: '0.5',
        rates: { perInputToken: '0.0006', perOutputToken: '0.002' },
      },
      method: 'PUT',
      pathname: expect.stringMatching(
        /^\/api\/licenses\/enterprise-v2\/conversion-rules\/[^/]+$/,
      ),
    });
  });

  test('refuses a rate that is not a number, and sends nothing', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    const writes = recordWrites(page, RULE_WRITES);
    await card.goto();

    await card.openCell('enterprise-v2~claude-sonnet-4-5');
    await card.rate('Per input token').fill('abc');
    await card.rate('Per output token').focus();

    await expect(card.panel()).toContainText(
      'A rate is a number, 0 or more, with at most 10 decimals.',
    );
    await expect(card.panelButton('Save rule')).toBeDisabled();
    await expect(
      card.cell('enterprise-v2~claude-sonnet-4-5'),
    ).toHaveAccessibleName(/1\.60 credits for the reference call/);
    expect(writes).toEqual([]);
  });
});
