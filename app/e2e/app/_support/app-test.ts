import { test as base, expect } from '@playwright/test';
import { startE2ECoverage, stopE2ECoverage } from './coverage';
import { fulfillJson } from './mocks/rest-route-helpers';
import {
  bulkFlagEvaluation,
  NO_PLATFORM_FLAGS,
  PLATFORM_FLAGS_EVALUATION_URL,
} from './model/platform-flags';

export { expect };

export const test = base.extend({
  page: async ({ browserName, page }, use, testInfo) => {
    const collectCoverage = await startE2ECoverage(page, browserName);

    // The suite runs the open-source console unless a spec turns a platform flag
    // on. The MSW worker already answers this way, but it only starts once a
    // spec installs some slot, and page-route mode starts none: without this the
    // evaluation reached the dev server, which has no OFREP endpoint, and the
    // flags read off only because that request failed. On the context, so it
    // also sees what a running worker lets through; an installed slot, or
    // installFlagEvaluations's page route, answers first.
    await page
      .context()
      .route(PLATFORM_FLAGS_EVALUATION_URL, (route) =>
        fulfillJson(route, 200, bulkFlagEvaluation(NO_PLATFORM_FLAGS)),
      );
    let coverageError: unknown;

    try {
      await use(page);
    } finally {
      try {
        await stopE2ECoverage(page, testInfo, collectCoverage);
      } catch (error) {
        if (testInfo.status && testInfo.status !== testInfo.expectedStatus) {
          console.warn('Failed to stop E2E coverage after test failure', error);
        } else {
          coverageError = error;
        }
      }
    }

    if (coverageError) {
      throw coverageError;
    }
  },
});
export {
  expectAlertDialog,
  expectDialogClosed,
  expectEmptyState,
  expectErrorToast,
  expectPageHeading,
  expectToast,
} from './assertions/toast';
