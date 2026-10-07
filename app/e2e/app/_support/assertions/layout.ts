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

/**
 * What a container holds is wholly inside it, on the horizontal axis: a row of
 * buttons that is wider than the card it is in is cut off by the card, or spills
 * out of it, and the page does not scroll to say so.
 */
export async function expectInside(container: Locator, item: Locator) {
  const [outer, inner] = await Promise.all([
    container.boundingBox(),
    item.boundingBox(),
  ]);

  expect(outer).not.toBeNull();
  expect(inner).not.toBeNull();
  expect(inner?.x).toBeGreaterThanOrEqual(outer?.x ?? 0);
  expect((inner?.x ?? 0) + (inner?.width ?? 0)).toBeLessThanOrEqual(
    (outer?.x ?? 0) + (outer?.width ?? 0),
  );
}
