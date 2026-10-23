import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createFormRecoveryRuntime,
  FORM_RECOVERY_STORAGE_KEY,
  formRecoveryCollectionExists,
  formRecoveryStorageHasData,
  getFormRecoveryRuntime,
  isFormRecoveryPersistent,
  resetFormRecoveryForTests,
} from '../form-recovery-collection';
import { replaceRecord, subscribeToFormRecovery } from '../form-recovery-repository';
import {
  createMemoryStorage,
  probeFormRecoveryStorage,
} from '../form-recovery-storage';
import { pruneFormRecoveryAtStartup } from '../form-recovery-startup';
import { makeEntry, NOW, SCOPE } from './test-records';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('probeFormRecoveryStorage', () => {
  it('uses window.localStorage itself and leaves it empty', () => {
    const probe = probeFormRecoveryStorage();

    expect(probe.persistent).toBe(true);
    expect(probe.storage).toBe(window.localStorage);
    expect(window.localStorage).toHaveLength(0);
  });

  it('falls back to memory when the storage throws on access', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    const probe = probeFormRecoveryStorage();

    expect(probe.persistent).toBe(false);
    probe.storage.setItem('a', '1');
    expect(probe.storage.getItem('a')).toBe('1');
    probe.storage.removeItem('a');
    expect(probe.storage.getItem('a')).toBeNull();
  });

  it('falls back to memory when the storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(probeFormRecoveryStorage().persistent).toBe(false);
  });

  it('keeps a memory storage separate from every other', () => {
    const first = createMemoryStorage();
    const second = createMemoryStorage();
    first.setItem('a', '1');

    expect(second.getItem('a')).toBeNull();
  });
});

describe('the collection singleton', () => {
  it('is inert, and creates no collection, when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    resetFormRecoveryForTests();

    expect(isFormRecoveryPersistent()).toBe(false);
    expect(getFormRecoveryRuntime()).toBeNull();
    expect(formRecoveryCollectionExists()).toBe(false);
    expect(formRecoveryStorageHasData()).toBe(false);
  });

  it('is created at the first use, not before', () => {
    expect(formRecoveryCollectionExists()).toBe(false);
    expect(isFormRecoveryPersistent()).toBe(true);
    expect(formRecoveryCollectionExists()).toBe(false);

    expect(getFormRecoveryRuntime()).not.toBeNull();
    expect(formRecoveryCollectionExists()).toBe(true);
  });

  it('is forgotten by the reset, with its storage key', async () => {
    const handle = replaceRecord(makeEntry(), { mountedAt: NOW.toISOString() });
    expect(handle.written).toBe(true);
    expect(window.localStorage.getItem(FORM_RECOVERY_STORAGE_KEY)).not.toBeNull();

    resetFormRecoveryForTests();

    expect(formRecoveryCollectionExists()).toBe(false);
    expect(window.localStorage.getItem(FORM_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it('loads what the storage holds as soon as it is created', () => {
    const entry = makeEntry();
    window.localStorage.setItem(
      FORM_RECOVERY_STORAGE_KEY,
      JSON.stringify({ [`s:${entry.key}`]: { versionKey: 'v', data: entry } }),
    );

    expect(getFormRecoveryRuntime()!.collection.has(entry.key)).toBe(true);
  });

  it('can be built over a stand-in storage and event api', () => {
    const storage = createMemoryStorage();
    const events = new EventTarget();
    const runtime = createFormRecoveryRuntime({
      storage,
      storageEventApi: {
        addEventListener: (type, listener) =>
          events.addEventListener(type, listener as EventListener),
        removeEventListener: (type, listener) =>
          events.removeEventListener(type, listener as EventListener),
      },
    });
    const entry = makeEntry();

    storage.setItem(
      FORM_RECOVERY_STORAGE_KEY,
      JSON.stringify({ [`s:${entry.key}`]: { versionKey: 'v', data: entry } }),
    );
    runtime.resync();

    expect(runtime.collection.has(entry.key)).toBe(true);
    runtime.dispose();
  });
});

describe('subscribeToFormRecovery', () => {
  it('tells of a write made here and of a change made by another tab', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToFormRecovery(listener);
    const entry = makeEntry();

    replaceRecord(entry, { mountedAt: NOW.toISOString() });
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    listener.mockClear();

    const other = makeEntry({ lineageId: 'other' });
    window.localStorage.setItem(
      FORM_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        [`s:${entry.key}`]: { versionKey: 'v1', data: entry },
        [`s:${other.key}`]: { versionKey: 'v2', data: other },
      }),
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: FORM_RECOVERY_STORAGE_KEY,
        storageArea: window.localStorage,
      }),
    );
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    unsubscribe();
    listener.mockClear();
    replaceRecord(makeEntry({ lineageId: 'third' }), {
      mountedAt: NOW.toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listener).not.toHaveBeenCalled();
  });

  it('does nothing without a storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    resetFormRecoveryForTests();

    expect(subscribeToFormRecovery(() => {})()).toBeUndefined();
  });
});

describe('pruneFormRecoveryAtStartup', () => {
  const identity = { userId: SCOPE.userId, organizationId: SCOPE.organizationId };

  it('creates no collection when the key does not exist', async () => {
    await pruneFormRecoveryAtStartup(identity);

    expect(formRecoveryCollectionExists()).toBe(false);
  });

  it('removes the entries of another user, and nothing else', async () => {
    const mine = makeEntry({ lineageId: 'mine', expiresAt: new Date(Date.now() + 1e9).toISOString() });
    const foreign = makeEntry({
      lineageId: 'foreign',
      userId: 'user_2',
      expiresAt: new Date(Date.now() + 1e9).toISOString(),
    });
    window.localStorage.setItem(
      FORM_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        [`s:${mine.key}`]: { versionKey: 'v1', data: mine },
        [`s:${foreign.key}`]: { versionKey: 'v2', data: foreign },
      }),
    );

    await pruneFormRecoveryAtStartup(identity);

    expect(Object.keys(JSON.parse(window.localStorage.getItem(FORM_RECOVERY_STORAGE_KEY)!))).toEqual([
      `s:${mine.key}`,
    ]);
  });

  it('writes nothing when there is nothing to remove', async () => {
    const mine = makeEntry({ expiresAt: new Date(Date.now() + 1e9).toISOString() });
    window.localStorage.setItem(
      FORM_RECOVERY_STORAGE_KEY,
      JSON.stringify({ [`s:${mine.key}`]: { versionKey: 'v1', data: mine } }),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    await pruneFormRecoveryAtStartup(identity);

    const writes = setItem.mock.calls.filter(
      ([key]) => key === FORM_RECOVERY_STORAGE_KEY,
    );
    expect(writes).toHaveLength(0);
  });
});
