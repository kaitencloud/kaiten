import { expect, test } from '../_support/app-test';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// The rate card: one column per current licence version, one row per model,
// and where each price comes from. Opening a cell puts it in the URL and shows
// the ladder of the resolution beside the grid.

test.describe('the rate card', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('prices the reference call on every current version, with where the price comes from', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await card.goto();

    await expect(card.heading()).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Credit pool' }),
    ).toContainText('AI credits');
    await expect(card.requestTypeTab('Completion')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    for (const head of [
      'Business 2025',
      'Enterprise 2026',
      'Starter 2026',
      'Trial 2025',
    ]) {
      await expect(card.columnHeader(head)).toBeVisible();
    }

    // Its own rule, a wildcard, and a version that grants the pool with none.
    await expect(
      card.cell('enterprise-v2~claude-sonnet-4-5'),
    ).toHaveAccessibleName(
      'Claude Sonnet 4.5 on Enterprise: 1.60 credits for the reference call, $0.0075 per credit, Own rule',
    );
    await expect(
      card.cell('enterprise-v2~claude-haiku-4-5'),
    ).toHaveAccessibleName(
      'Claude Haiku 4.5 on Enterprise: 2.00 credits for the reference call, $0.0020 per credit, Via any model · completion',
    );
    await expect(card.cell('trial~claude-haiku-4-5')).toHaveAccessibleName(
      'Claude Haiku 4.5 on Trial: the version grants the pool but has no rule, calls are refused',
    );
    await expect(card.cell('trial~*')).toHaveAccessibleName(
      'Any model on Trial: no wildcard',
    );
  });

  test('opens a cell in the URL, and shows which level of the ladder prices it', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await card.goto();

    await card.openCell('enterprise-v2~claude-sonnet-4-5');
    await card.expectSearchParam('cell', 'enterprise-v2~claude-sonnet-4-5');
    await card.expectPanelTitle('Claude Sonnet 4.5 · Enterprise 2026');
    await expect(
      card.ladderLevel('Exact model · exact request type'),
    ).toContainText('Applies');
    await expect(
      card.ladderLevel('Any model · exact request type'),
    ).toContainText('Shadowed');
    await expect(card.rate('Per input token')).toHaveValue('0.0004');
    await expect(card.panel()).toContainText(
      'Last edited by E2E Tester · Oct 28, 2026',
    );
    // Nothing changed yet: nothing to save.
    await expect(card.panelButton('Save rule')).toBeDisabled();

    await card.panelButton('Close').click();
    await expect(card.panel()).toHaveCount(0);
    await card.expectSearchParam('cell', null);
  });

  test('a link to a cell opens the same cell', async ({ page }) => {
    const card = new AiRateCardDriver(page);
    await card.goto('?pool=ai-credits&cell=enterprise-v2~claude-haiku-4-5');

    await expect(card.cell('enterprise-v2~claude-haiku-4-5')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await card.expectPanelTitle('Claude Haiku 4.5 · Enterprise 2026');
    await expect(
      card.ladderLevel('Any model · exact request type'),
    ).toContainText('Applies');
    await expect(card.panelButton('Override for this model')).toBeVisible();
  });

  test('a version that grants the pool with no rule says its calls are refused', async ({
    page,
  }) => {
    const card = new AiRateCardDriver(page);
    await card.goto();

    await card.openCell('trial~claude-haiku-4-5');
    await expect(card.panel()).toContainText(
      'This version grants the pool and has no rule.',
    );
    await expect(card.panel()).toContainText(
      'Every call on it is refused and charged nothing.',
    );
    await expect(
      card.panelButton('Add a rule for Claude Haiku 4.5'),
    ).toBeVisible();
  });
});
