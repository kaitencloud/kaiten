import {
  createCollection,
  localStorageCollectionOptions,
} from '@tanstack/react-db';
import { resetPendingUndo } from './form-recovery-pending-undo';
import { formRecoveryRecordSchema } from './form-recovery-record';
import {
  probeFormRecoveryStorage,
  type FormRecoveryStorage,
  type FormRecoveryStorageApi,
} from './form-recovery-storage';

export const FORM_RECOVERY_STORAGE_KEY = 'kaiten:form-recovery';

type StorageListener = (event: StorageEvent) => void;

/** The part of `window` the collection listens on. */
export type FormRecoveryStorageEventApi = {
  addEventListener: (type: 'storage', listener: StorageListener) => void;
  removeEventListener: (type: 'storage', listener: StorageListener) => void;
};

export type FormRecoveryStorageDeps = {
  /** `window.localStorage` itself: see `probeFormRecoveryStorage`. */
  storage: FormRecoveryStorageApi;
  storageEventApi: FormRecoveryStorageEventApi;
};

function buildCollection(
  storage: FormRecoveryStorageApi,
  storageEventApi: FormRecoveryStorageEventApi,
) {
  return createCollection(
    localStorageCollectionOptions({
      id: 'form-recovery',
      storageKey: FORM_RECOVERY_STORAGE_KEY,
      storage,
      storageEventApi,
      // No parser: plain JSON drops the `undefined` keys a replacement leaves.
      // The values of a form go through the payload codec instead.
      schema: formRecoveryRecordSchema,
      getKey: (record) => record.key,
      // Never dropped from memory, and loaded when it is created: the first
      // render of a form reads it synchronously.
      gcTime: Number.POSITIVE_INFINITY,
      startSync: true,
      // No `onInsert` or `onUpdate`: the storage is then written while
      // `insert` and `update` run, which a flush on `pagehide` needs.
    }),
  );
}

export type FormRecoveryCollection = ReturnType<typeof buildCollection>;

export type FormRecoveryRuntime = {
  collection: FormRecoveryCollection;
  storage: FormRecoveryStorageApi;
  /**
   * Reads the storage again, now. TanStack DB exposes no reload, and its
   * listener of the `storage` event only checks `key` and `storageArea` before
   * it reads the storage synchronously: calling it with such an event is a
   * reload. A unit test pins this down, so that an upgrade which changes it
   * fails in CI.
   */
  resync: () => void;
  dispose: () => void;
};

/**
 * Builds the collection over a given storage. The app uses the singleton of
 * {@link getFormRecoveryRuntime}; this is what tests build to hand it a
 * stand-in.
 */
export function createFormRecoveryRuntime(
  deps: FormRecoveryStorageDeps,
): FormRecoveryRuntime {
  let listener: StorageListener | null = null;

  const captured: FormRecoveryStorageEventApi = {
    addEventListener: (type, next) => {
      listener = next;
      deps.storageEventApi.addEventListener(type, next);
    },
    removeEventListener: (type, previous) => {
      if (listener === previous) {
        listener = null;
      }
      deps.storageEventApi.removeEventListener(type, previous);
    },
  };

  const collection = buildCollection(deps.storage, captured);

  return {
    collection,
    storage: deps.storage,
    resync: () => {
      listener?.({
        key: FORM_RECOVERY_STORAGE_KEY,
        storageArea: deps.storage,
      } as unknown as StorageEvent);
    },
    dispose: () => {
      if (listener) {
        deps.storageEventApi.removeEventListener('storage', listener);
        listener = null;
      }
      void collection.cleanup();
    },
  };
}

let probe: FormRecoveryStorage | null = null;
let runtime: FormRecoveryRuntime | null = null;

function getProbe(): FormRecoveryStorage {
  probe ??= probeFormRecoveryStorage();
  return probe;
}

/** False when the browser refuses to store: the feature is inert. */
export function isFormRecoveryPersistent(): boolean {
  return getProbe().persistent;
}

/**
 * The shared collection, created at the first call: a screen that never
 * recovers anything (an edit form) never reaches the storage. Null when the
 * storage is unavailable.
 */
export function getFormRecoveryRuntime(): FormRecoveryRuntime | null {
  if (runtime) {
    return runtime;
  }

  const { storage, persistent } = getProbe();
  if (!persistent) {
    return null;
  }

  runtime = createFormRecoveryRuntime({ storage, storageEventApi: window });
  return runtime;
}

/** True once something created the collection. */
export function formRecoveryCollectionExists(): boolean {
  return runtime !== null;
}

/** True when the storage holds the key, without creating the collection. */
export function formRecoveryStorageHasData(): boolean {
  const { storage, persistent } = getProbe();
  if (!persistent) {
    return false;
  }

  try {
    return storage.getItem(FORM_RECOVERY_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Reads the storage again, if the collection exists. */
export function resyncFormRecovery(): void {
  runtime?.resync();
}

/**
 * For `src/__tests__/setup.ts`: the collection is a module singleton and the
 * setup does not empty the storage between two tests.
 */
export function resetFormRecoveryForTests(): void {
  runtime?.dispose();
  runtime = null;
  probe = null;
  resetPendingUndo();

  try {
    window.localStorage.removeItem(FORM_RECOVERY_STORAGE_KEY);
  } catch {
    // A test that blocked the storage has nothing to clear.
  }
}
