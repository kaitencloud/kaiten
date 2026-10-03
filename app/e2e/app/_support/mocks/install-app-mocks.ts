import type { Page } from '@playwright/test';
import {
  E2E_MSW_STORAGE_KEY,
  type E2EMswConfig,
  type ModelSlotKey,
  type MswSlotKey,
  type SerializableModel,
} from '../contracts/msw-slots';
export type { MswSlotKey } from '../contracts/msw-slots';

/**
 * Push the model's serialized state onto `window.__KAITEN_E2E_MSW__[slot]`
 * before the page navigates. The dev server's `main.tsx` reads this object
 * and starts the matching MSW handlers.
 */
export function installMswMocks<K extends ModelSlotKey>(
  page: Page,
  slot: K,
  model: SerializableModel<K>,
): Promise<void> {
  return installSlot(page, slot, model.serializeForMsw());
}

/**
 * Answers the bulk OFREP evaluation the app gates its own features on, so a
 * spec can open a flag-gated surface (`{ webhooks: true }`). Keyed by flag
 * slug; anything not listed stays absent, which the app reads as off. Without
 * it the suite reads every platform flag as off (`NO_PLATFORM_FLAGS`).
 */
export function installFlagEvaluations(
  page: Page,
  flags: Record<string, boolean>,
): Promise<void> {
  return installSlot(page, 'flagEvaluations', flags);
}

async function installSlot<K extends MswSlotKey>(
  page: Page,
  slot: K,
  payload: E2EMswConfig[K],
): Promise<void> {
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
}
