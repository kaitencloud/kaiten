import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The page does not scroll sideways: what is wider than the screen (a table of
 * prices, the lines of an invoice) scrolls inside its own container, and the page
 * keeps the width of the screen.
 */
export async function expectNoHorizontalScroll(page: Page, width: number) {
  const scrollWidth = await page.evaluate(
    () => document.scrollingElement?.scrollWidth ?? 0,
  );

  expect(scrollWidth).toBeLessThanOrEqual(width);
}

/**
 * A table too wide for the screen scrolls inside the container it is in: the
 * container clips it and scrolls on the horizontal axis, so that the page
 * itself does not.
 */
export async function expectScrollsInside(table: Locator) {
  const container = table.locator(
    'xpath=ancestor::*[@data-slot="table-container"][1]',
  );

  await expect(container).toHaveCSS('overflow-x', 'auto');
  const { clientWidth, scrollWidth } = await container.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
}
