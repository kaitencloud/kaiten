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

/** Replace a running page's mock slot without reloading or touching its query cache. */
export function updateMswMocks<K extends ModelSlotKey>(
  page: Page,
  slot: K,
  model: SerializableModel<K>,
): Promise<void> {
  return page.evaluate(
    async ({ storageKey, slotKey, slotValue }) => {
      const target = window as Window & {
        __KAITEN_MSW_UPDATE__?: (config: E2EMswConfig) => Promise<void>;
      };
      if (!target.__KAITEN_MSW_UPDATE__) {
        throw new Error('The page has no running E2E mock API to update');
      }
      const config = JSON.parse(
        window.sessionStorage.getItem(storageKey) ?? '{}',
      ) as E2EMswConfig;
      await target.__KAITEN_MSW_UPDATE__({ ...config, [slotKey]: slotValue });
    },
    {
      storageKey: E2E_MSW_STORAGE_KEY,
      slotKey: slot,
      slotValue: model.serializeForMsw(),
    },
  );
}

/**
 * Answers the bulk OFREP evaluation the app gates its own features on, so a
 * spec can open a flag-gated surface (`{ 'demo-sandbox': true }`). Keyed by flag
 * slug; anything not listed stays absent, which the app reads as off. Without
 * it the suite reads every platform flag as off (`NO_PLATFORM_FLAGS`).
 */
export function installFlagEvaluations(
  page: Page,
  flags: Record<string, boolean>,
): Promise<void> {
  return installSlot(page, 'flagEvaluations', flags);
}

/** Deployment readiness is independent of platform rollout targeting. Default: false. */
export function installAiCapability(
  page: Page,
  enabled: boolean,
): Promise<void> {
  return installSlot(page, 'aiCapability', { enabled });
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
