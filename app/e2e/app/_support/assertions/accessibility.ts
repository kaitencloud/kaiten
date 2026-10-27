import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { expectFocusTrapped } from './focus';

type AxeResults = Awaited<
  ReturnType<InstanceType<typeof AxeBuilder>['analyze']>
>;
type AxeViolation = AxeResults['violations'][number];

export async function expectNoAccessibilityViolations(page: Page) {
  // Never read a page half-way through a transition: its contrast is a blend.
  await settle(page);
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

/** How long `settle` waits at most, and how many quiet frames in a row it wants. */
const SETTLE_BOUND_MS = 2_000;
const SETTLE_QUIET_FRAMES = 3;

/**
 * Waits for the animations and transitions that end, which axe would otherwise read
 * half-way: a dialog fades in, and the contrast of its text is that of a text still
 * being drawn. The ones that never end are left alone: a spinner that loops, an
 * effect that follows the scroll of a container.
 *
 * One look at the running animations is not enough. A transition begins at the style
 * recalculation after the change that causes it, and a change made by the page in
 * answer to another (a theme class read by a component, then repainted) reaches the
 * next frame, not the current one: an empty list means nothing yet. So it looks
 * again each frame, waits for what it finds, and returns once several frames in a
 * row find nothing to wait for. A bound keeps any other animation from holding the
 * page up.
 */
export async function settle(page: Page) {
  await page.evaluate(
    async ({ bound, quietFrames }) => {
      const deadline = Date.now() + bound;
      const nextFrame = () =>
        new Promise<void>((resolve) => {
          // A page that is not painting calls no frame: do not wait for one.
          setTimeout(resolve, 100);
          requestAnimationFrame(() => resolve());
        });
      const ending = () =>
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.timeline === document.timeline &&
              animation.effect?.getComputedTiming().iterations !== Infinity,
          );

      let quiet = 0;
      while (quiet < quietFrames && Date.now() < deadline) {
        await nextFrame();
        const pending = ending();
        if (pending.length === 0) {
          quiet += 1;
          continue;
        }
        quiet = 0;
        await Promise.race([
          Promise.all(
            pending.map((animation) =>
              animation.finished.catch(() => undefined),
            ),
          ),
          new Promise((resolve) =>
            setTimeout(resolve, Math.max(deadline - Date.now(), 0)),
          ),
        ]);
      }
    },
    { bound: SETTLE_BOUND_MS, quietFrames: SETTLE_QUIET_FRAMES },
  );
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
