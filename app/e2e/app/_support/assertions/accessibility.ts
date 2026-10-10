import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { expectFocusTrapped } from './focus';

type AxeResults = Awaited<
  ReturnType<InstanceType<typeof AxeBuilder>['analyze']>
>;
type AxeViolation = AxeResults['violations'][number];

export async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations, formatViolations(results.violations)).toEqual([]);
}

function formatViolations(violations: AxeViolation[]) {
  if (violations.length === 0) {
    return '';
  }

  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => {
          const target = node.target.join(' ');
          const summary =
            node.failureSummary?.replace(/\s+/g, ' ').trim() ??
            'No failure summary';

          return `    - ${target}: ${summary}`;
        })
        .join('\n');

      return [
        `${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}`,
        `  ${violation.helpUrl}`,
        nodes,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * Waits for the animations and transitions that end, which axe would otherwise read
 * half-way: a dialog fades in, and the contrast of its text is that of a text still
 * being drawn. The ones that never end are left alone: a spinner that loops, an
 * effect that follows the scroll of a container. A bound keeps any other from
 * holding the page up.
 */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    const ends = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.timeline === document.timeline &&
          animation.effect?.getComputedTiming().iterations !== Infinity,
      )
      .map((animation) => animation.finished.catch(() => undefined));

    await Promise.race([
      Promise.all(ends),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  });
}

/** A dialog that is open: no violation on the page, the focus held, closed by Escape. */
export async function expectDialogAccessible(page: Page, dialog: Locator) {
  await settle(page);
  await expectNoAccessibilityViolations(page);
  await expectFocusTrapped(page, dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}

/**
 * Switches the console to the light theme. It starts dark, and the tokens of the
 * other theme are the ones under the root class that is left off. Elements
 * transition their colors, which axe would read half-way: it waits for them.
 */
export async function useLightTheme(page: Page) {
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
  });
  await settle(page);
}
