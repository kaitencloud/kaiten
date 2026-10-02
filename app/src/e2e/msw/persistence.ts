import {
  E2E_MSW_STORAGE_KEY,
  type E2EMswConfig,
} from '../../../e2e/app/_support/contracts/msw-slots';

export type PersistMswState = () => void;
export const noop = () => {};

export function readStoredConfig(): E2EMswConfig {
  try {
    return JSON.parse(
      window.sessionStorage.getItem(E2E_MSW_STORAGE_KEY) ?? '{}',
    ) as E2EMswConfig;
  } catch {
    return {};
  }
}

export function writeStoredConfig(config: E2EMswConfig) {
  window.sessionStorage.setItem(E2E_MSW_STORAGE_KEY, JSON.stringify(config));
  (
    window as Window & { __KAITEN_E2E_MSW__?: E2EMswConfig }
  ).__KAITEN_E2E_MSW__ = config;
}

export function persistSlot<K extends keyof E2EMswConfig>(
  slot: K,
  state: E2EMswConfig[K],
) {
  writeStoredConfig({ ...readStoredConfig(), [slot]: state });
}
