import { afterEach, beforeEach } from 'vite-plus/test';

/** A Web Locks manager for jsdom: exclusive locks, `ifAvailable`, `query`. */
export function createFakeLocks() {
  const held = new Map<string, () => void>();

  const manager = {
    request: async (
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: { name: string } | null) => unknown,
    ) => {
      if (held.has(name)) {
        if (options.ifAvailable) {
          return callback(null);
        }
        throw new Error('waiting is not supported by this fake');
      }

      held.set(name, () => {});
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
    query: async () => ({
      held: [...held.keys()].map((name) => ({ name })),
      pending: [],
    }),
  };

  return { manager, held };
}

/**
 * Installs a fake `navigator.locks` for each test of the file; the returned
 * object is the same one the tests read.
 */
export function useFakeLocks() {
  const fake = createFakeLocks();
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    fake.held.clear();
    original = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', {
      value: fake.manager,
      configurable: true,
    });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, 'locks', original);
    } else {
      delete (navigator as { locks?: unknown }).locks;
    }
  });

  return fake;
}

/** What a tab that crashed leaves behind: its locks are released by the browser. */
export function releaseAllLocks(fake: ReturnType<typeof createFakeLocks>) {
  fake.held.clear();
}
