import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { buildLockName } from '../form-recovery-keys';
import {
  areLineageLocksSupported,
  holdLineage,
  liveLineages,
} from '../form-recovery-locks';

/** A small Web Locks manager: exclusive locks, `ifAvailable`, `query`. */
function createFakeLocks() {
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

function stubLocks(value: unknown) {
  Object.defineProperty(navigator, 'locks', { value, configurable: true });
}

let original: PropertyDescriptor | undefined;

beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(navigator, 'locks');
});

afterEach(() => {
  if (original) {
    Object.defineProperty(navigator, 'locks', original);
  } else {
    delete (navigator as { locks?: unknown }).locks;
  }
});

describe('form recovery locks', () => {
  it('holds a lineage until it is released', async () => {
    const { manager } = createFakeLocks();
    stubLocks(manager);

    const hold = await holdLineage('a|b');

    expect(hold.status).toBe('held');
    expect([...(await liveLineages())]).toEqual(['a|b']);

    if (hold.status === 'held') hold.release();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...(await liveLineages())]).toEqual([]);
  });

  it('reports a lineage another context holds as taken', async () => {
    const { manager } = createFakeLocks();
    stubLocks(manager);
    await holdLineage('a|b');

    expect(await holdLineage('a|b')).toEqual({ status: 'taken' });
  });

  it('ignores the locks that are not its own', async () => {
    const { manager, held } = createFakeLocks();
    stubLocks(manager);
    held.set('something-else', () => {});
    held.set(buildLockName('x|y'), () => {});

    expect([...(await liveLineages())]).toEqual(['x|y']);
  });

  it('knows no live lineage without the API, and says it is unsupported', async () => {
    stubLocks(undefined);

    expect(areLineageLocksSupported()).toBe(false);
    expect(await holdLineage('a|b')).toEqual({ status: 'unsupported' });
    expect((await liveLineages()).size).toBe(0);
  });

  it('falls back to unsupported when the API fails', async () => {
    stubLocks({
      request: () => Promise.reject(new Error('insecure context')),
      query: () => Promise.reject(new Error('insecure context')),
    });

    expect(await holdLineage('a|b')).toEqual({ status: 'unsupported' });
    expect((await liveLineages()).size).toBe(0);
  });
});
