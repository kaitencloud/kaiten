import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// Adding a rule from a cell: overriding a wildcard for one model, a rule for
// one request type beside a model's any-type rule, and a first rule on a
// version that grants the pool with none. A new rule opens empty: nothing can
// be added before a rate is typed.

const RULE_WRITES = /^\/api\/licenses\/[^/]+\/conversion-rules$/;

test.describe('adding a rule on the rate card', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('overrides the wildcard for one model, which then has its own price', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    const writes = recordWrites(page, RULE_WRITES);
    await card.goto();

    await card.openCell('enterprise-v2~claude-haiku-4-5');
    await expect(card.panel()).toContainText('Priced by the wildcard');
    await card.panelButton('Override for this model').click();

    // Empty, so it cannot be added as it is.
    await expect(card.rate('Per request')).toHaveValue('');
    await expect(card.panelButton('Add rule')).toBeDisabled();
    await card.rate('Per request').fill('3');
    await card.submit('Add rule');

    await expectToast(page, 'Rule added');
    await expect(
      card.cell('enterprise-v2~claude-haiku-4-5'),
    ).toHaveAccessibleName(
      /^Claude Haiku 4\.5 on Enterprise: 3\.00 credits for the reference call, .*Own rule$/,
    );
    // The wildcard still prices the others.
    await expect(
      card.cell('enterprise-v2~claude-opus-4-1'),
    ).toHaveAccessibleName(/Via any model · completion$/);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      body: {
        entitlementSlug: 'ai-credits',
        modelSlug: 'claude-haiku-4-5',
        rates: { perRequest: '3' },
        requestType: 'COMPLETION',
      },
      method: 'POST',
      pathname: '/api/licenses/enterprise-v2/conversion-rules',
    });
  });

  test('adds a rule for one request type beside the model’s rule for any type', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    const writes = recordWrites(page, RULE_WRITES);
    await card.goto();

    await card.openCell('enterprise-v2~gemini-2-5-flash');
    await expect(
      card.ladderLevel('Exact model · any request type'),
    ).toContainText('Applies');
    await card.panelButton('Add a rule for completion only').click();
    await card.rate('Per request').fill('2');
    await card.submit('Add rule');

    await expectToast(page, 'Rule added');
    await expect(
      card.cell('enterprise-v2~gemini-2-5-flash'),
    ).toHaveAccessibleName(
      /^Gemini 2\.5 Flash on Enterprise: 2\.00 credits for the reference call, /,
    );
    await card.openCell('enterprise-v2~gemini-2-5-flash');
    await expect(
      card.ladderLevel('Exact model · exact request type'),
    ).toContainText('Applies');
    await expect(
      card.ladderLevel('Exact model · any request type'),
    ).toContainText('Shadowed');
    expect(writes[0]).toMatchObject({
      body: { modelSlug: 'gemini-2-5-flash', requestType: 'COMPLETION' },
    });
  });

  test('prices a model on a version that grants the pool with no rule', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await card.goto();

    await card.openCell('trial~claude-haiku-4-5');
    await card.panelButton('Add a rule for Claude Haiku 4.5').click();
    await expect(card.panelButton('Add rule')).toBeDisabled();
    await card.rate('Per request').fill('1');
    await card.submit('Add rule');

    await expectToast(page, 'Rule added');
    await expect(card.cell('trial~claude-haiku-4-5')).toHaveAccessibleName(
      /^Claude Haiku 4\.5 on Trial: 1\.00 credits for the reference call, .*Own rule$/,
    );
    // The other models of the version have no rule: still not authorized.
    await expect(card.cell('trial~claude-opus-4-1')).toHaveAccessibleName(
      'Claude Opus 4.1 on Trial: not authorized, no rule',
    );
  });
});
