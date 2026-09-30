import type { Page } from '@playwright/test';

/**
 * How long to wait after navigation for Storybook to settle. Network idle is
 * a soft signal; we cap it so a slow lazy chunk doesn't block the test.
 */
const NETWORK_IDLE_TIMEOUT_MS = 5_000;
const MAX_OUTDATED_DEP_RETRIES = 3;

type OpenStoryOptions = {
  /**
   * Visual regression tests want a tighter "page is fully painted" guarantee.
   * Default `'domcontentloaded'` is enough for behaviour assertions; pass
   * `'networkidle'` for screenshot snapshots.
   */
  waitUntil?: 'domcontentloaded' | 'networkidle';
};

/**
 * Open a Storybook story by id and wait for it to be ready.
 *
 * Vite dev server returns 504 "Outdated Optimize Dep" on the first hit after
 * a cache invalidation (e.g. after running `test:stories` which shares the
 * same `.cache/storybook`). Reloading once after a 504 lets the
 * re-optimization finish before tests assert. In static / CI mode this is a
 * no-op because the built bundle is served as immutable files.
 *
 * Throws if the story never becomes ready after the retry budget — silently
 * returning would let downstream assertions fail with misleading messages.
 */
export const openStorybookStory = async (
  page: Page,
  storyId: string,
  options: OpenStoryOptions = {},
): Promise<void> => {
  const url = `/iframe.html?id=${storyId}&viewMode=story`;
  const waitUntil = options.waitUntil ?? 'domcontentloaded';

  for (let attempt = 0; attempt < MAX_OUTDATED_DEP_RETRIES; attempt += 1) {
    let sawOutdatedDep = false;
    const listener = (response: import('@playwright/test').Response) => {
      if (response.status() === 504) {
        sawOutdatedDep = true;
      }
    };
    page.on('response', listener);

    await page.goto(url, { waitUntil });
    // Even when caller asked for `'networkidle'` above, give Storybook one
    // last tick to render either the story or the error boundary.
    await page
      .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
      .catch(() => {
        /* best effort */
      });

    page.off('response', listener);

    const errorCount = await page
      .getByText('Failed to fetch dynamically imported module')
      .count();

    if (!sawOutdatedDep && errorCount === 0) {
      return;
    }
  }

  throw new Error(
    `Storybook story "${storyId}" failed to open after ${MAX_OUTDATED_DEP_RETRIES} attempts ` +
      `(repeated 504 Outdated Optimize Dep or import failures). ` +
      `Run 'pnpm test:stories' once to warm the optimize cache, or use static Storybook ` +
      `(PLAYWRIGHT_STORYBOOK_STATIC=true).`,
  );
};

/**
 * Convenience: build the story id from a `<feature>--<story>` pair. Lets specs
 * stay short:
 *
 *   await openStorybookStoryByPath(page, 'features-releases-releaseform', 'default');
 */
export const openStorybookStoryByPath = async (
  page: Page,
  featurePath: string,
  storyName: string,
  options: OpenStoryOptions = {},
): Promise<void> => {
  await openStorybookStory(page, `${featurePath}--${storyName}`, options);
};
