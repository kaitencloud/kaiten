import type { Page } from '@playwright/test';
import {
  E2E_MSW_STORAGE_KEY,
  type E2EMswConfig,
  type ModelSlotKey,
  type MswSlotKey,
  type SerializableModel,
} from '../contracts/msw-slots';
export type { MswSlotKey } from '../contracts/msw-slots';
import {
  bulkFlagEvaluation,
  PLATFORM_FLAGS_EVALUATION_URL,
} from '../model/platform-flags';
import { fulfillJson } from './rest-route-helpers';

/**
 * Should we route through MSW (default) or fall back to Playwright
 * `page.route()` interception?
 *
 * Set `E2E_MOCKS=page-route` to keep the legacy Playwright-side mocks (useful
 * to debug an MSW-related regression without rolling back the architecture).
 */
export const isMswMockingEnabled = () => process.env.E2E_MOCKS !== 'page-route';

/**
 * Push the model's serialized state onto `window.__KAITEN_E2E_MSW__[slot]`
 * before the page navigates. The dev server's `main.tsx` reads this object
 * and starts the matching MSW handlers.
 *
 * Returns `true` if the MSW path was taken, `false` if the caller should
 * fall back to its `page.route()` installer.
 */
export async function tryInstallMswMocks<K extends ModelSlotKey>(
  page: Page,
  slot: K,
  model: SerializableModel<K>,
): Promise<boolean> {
  if (!isMswMockingEnabled()) {
    return false;
  }

  return installSlot(page, slot, model.serializeForMsw());
}

/**
 * Answers the bulk OFREP evaluation the app gates its own features on, so a
 * spec can open a flag-gated surface (`{ webhooks: true }`). Keyed by flag
 * slug; anything not listed stays absent, which the app reads as off. Without
 * it the suite reads every platform flag as off (`NO_PLATFORM_FLAGS`).
 *
 * In both mock modes: through its MSW slot, or with a page route, which answers
 * before the `app-test.ts` default on the context.
 */
export async function installFlagEvaluations(
  page: Page,
  flags: Record<string, boolean>,
): Promise<void> {
  if (isMswMockingEnabled()) {
    await installSlot(page, 'flagEvaluations', flags);
    return;
  }

  await page.route(PLATFORM_FLAGS_EVALUATION_URL, (route) =>
    fulfillJson(route, 200, bulkFlagEvaluation(flags)),
  );
}

async function installSlot<K extends MswSlotKey>(
  page: Page,
  slot: K,
  payload: E2EMswConfig[K],
): Promise<boolean> {
  await page.addInitScript(
    ({ storageKey, slotKey, slotValue }) => {
      const target = window as Window & {
        __KAITEN_E2E_MSW__?: Record<string, unknown>;
      };

      let storedConfig: Record<string, unknown> = {};

      try {
        storedConfig = JSON.parse(
          window.sessionStorage.getItem(storageKey) ?? '{}',
        ) as Record<string, unknown>;
      } catch {
        storedConfig = {};
      }

      const nextConfig = {
        ...storedConfig,
        [slotKey]: storedConfig[slotKey] ?? slotValue,
      };

      window.sessionStorage.setItem(storageKey, JSON.stringify(nextConfig));
      target.__KAITEN_E2E_MSW__ = nextConfig;
    },
    { storageKey: E2E_MSW_STORAGE_KEY, slotKey: slot, slotValue: payload },
  );

  return true;
}
