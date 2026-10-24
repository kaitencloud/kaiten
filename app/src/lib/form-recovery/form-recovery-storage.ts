/** The part of `Storage` the collection needs. */
export type FormRecoveryStorageApi = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export type FormRecoveryStorage = {
  storage: FormRecoveryStorageApi;
  /** False when the browser refuses to store: the feature is then inert. */
  persistent: boolean;
};

const PROBE_KEY = 'kaiten:form-recovery:probe';

export function createMemoryStorage(): FormRecoveryStorageApi {
  const items = new Map<string, string>();

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, String(value));
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/**
 * Tries a write on `window.localStorage`, then removes it. The probe leaves
 * the storage empty. A blocked storage (a `SecurityError` on access) or a full
 * one falls back to memory, with `persistent: false`.
 *
 * The collection must be given `window.localStorage` itself, not a stand-in:
 * its listener of the `storage` event compares the event's `storageArea` with
 * the storage it was given.
 */
export function probeFormRecoveryStorage(): FormRecoveryStorage {
  try {
    const { localStorage } = window;
    localStorage.setItem(PROBE_KEY, '1');
    localStorage.removeItem(PROBE_KEY);
    return { storage: localStorage, persistent: true };
  } catch {
    return { storage: createMemoryStorage(), persistent: false };
  }
}
