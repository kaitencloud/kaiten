import { test as base, expect } from '@playwright/test';
import { startE2ECoverage, stopE2ECoverage } from './coverage';
import { fulfillJson } from './mocks/rest-route-helpers';
import { isMswMockingEnabled } from './mocks/install-app-mocks';
import {
  bulkFlagEvaluation,
  NO_PLATFORM_FLAGS,
  PLATFORM_FLAGS_EVALUATION_URL,
} from './model/platform-flags';

export { expect };

export const test = base.extend({
  page: async ({ browserName, page }, use, testInfo) => {
    const collectCoverage = await startE2ECoverage(page, browserName);

    const unhandled: string[] = [];
    page.on('console', (message) => {
      if (message.text().startsWith('[MSW] Unhandled API request:'))
        unhandled.push(message.text());
    });
    if (isMswMockingEnabled()) {
      // Starts strict MSW even when a spec installs no business model. The
      // default flags are already closed; a spec may install an explicit gate.
      await page.addInitScript(() => {
        const target = window as Window & { __KAITEN_E2E_MSW__?: unknown };
        target.__KAITEN_E2E_MSW__ ??= {};
      });
    } else {
      await page
        .context()
        .route(PLATFORM_FLAGS_EVALUATION_URL, (route) =>
          fulfillJson(route, 200, bulkFlagEvaluation(NO_PLATFORM_FLAGS)),
        );
      // Same empty shell reads as MSW's shellHandlers, lower priority than a
      // pack's page routes. A list must stay paginated after T3 validation.
      await page
        .context()
        .route(
          /\/api\/(entitlements|feature-flags|licenses|instances|deployment-zones|releases)(\?.*)?$/,
          (route) => {
            if (route.request().method() !== 'GET') return route.fallback();
            return fulfillJson(route, 200, { hasMore: false, items: [] });
          },
        );
      await page
        .context()
        .route(/\/api\/v1\/notifications\/stream$/, (route) =>
          route.fulfill({ status: 204 }),
        );
    }
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
    expect(unhandled, 'Every API request must have a declared handler').toEqual(
      [],
    );
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
