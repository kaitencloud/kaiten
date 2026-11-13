import { expect, test } from '../_support/app-test';
import { expectNoHorizontalScroll } from '../_support/assertions/layout';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// The rate card at the size of a real catalogue: fifty-five models and four
// Enterprise versions. With the panel open on the far column, the selected cell
// is scrolled into view inside the grid's own scroller, and the page never
// scrolls sideways. At 1440 px the cell is whole; at 1024 px, where the panel
// is laid over the page, the grid has room for less than a cell beside the
// model column, so the cell is brought to its start, not shown whole (a known
// gap of the PR).

const FAR_CELL = 'enterprise-v4~nova-pro';
const SEARCH = `?pool=ai-credits&family=enterprise&cell=${FAR_CELL}`;

test.describe('the rate card with a large catalogue', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(
      page,
      createAiWorldModels({ catalogue: 'large', flag: 'on' }),
    );
  });

  test('at 1440 px the selected far cell is whole, beside the open panel', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    const card = new AiRateCardDriver(page);
    await card.goto(SEARCH);

    await expect(
      page.getByRole('status').filter({ hasText: '47 models · 4 versions' }),
    ).toBeVisible();
    await expect(card.panel()).toBeVisible();
    await expect(card.cell(FAR_CELL)).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => card.cellInSight(FAR_CELL))
      .toEqual({ starts: true, whole: true });
    await expectNoHorizontalScroll(page, 1440);
  });

  test('at 1024 px the selected far cell is brought into view', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 768, width: 1024 });
    const card = new AiRateCardDriver(page);
    await card.goto(SEARCH);

    await expect(card.panel()).toBeVisible();
    await expect(card.cell(FAR_CELL)).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await card.cellInSight(FAR_CELL)).starts)
      .toBe(true);
    await expectNoHorizontalScroll(page, 1024);
  });
});
