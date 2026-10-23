import { buildLockName, recordKeyOfLockName } from './form-recovery-keys';

/**
 * A tab that keeps an unsent input holds a Web Lock named after it. The browser
 * releases the lock when the page dies, so the lock is the one way to tell a
 * tab that is still working on an input from one that crashed.
 */
export type LineageHold =
  | { status: 'held'; release: () => void }
  | { status: 'taken' }
  | { status: 'unsupported' };

function getLocks(): LockManager | null {
  if (typeof navigator === 'undefined') {
    return null;
  }
  return (navigator as Navigator & { locks?: LockManager }).locks ?? null;
}

export function areLineageLocksSupported(): boolean {
  return getLocks() !== null;
}

/**
 * Takes the lock of a record, if no tab holds it. The lock is kept until
 * `release` is called or the page goes away.
 */
export async function holdLineage(recordKey: string): Promise<LineageHold> {
  const locks = getLocks();
  if (!locks) {
    return { status: 'unsupported' };
  }

  try {
    return await new Promise<LineageHold>((resolve) => {
      void locks
        .request(buildLockName(recordKey), { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve({ status: 'taken' });
            return undefined;
          }

          return new Promise<void>((release) => {
            resolve({ status: 'held', release: () => release() });
          });
        })
        .catch(() => resolve({ status: 'unsupported' }));
    });
  } catch {
    return { status: 'unsupported' };
  }
}

/**
 * The records some tab holds right now, this one included. Empty without the
 * API: no input is then known to be alive.
 */
export async function liveLineages(): Promise<ReadonlySet<string>> {
  const locks = getLocks();
  if (!locks) {
    return new Set();
  }

  try {
    const snapshot = await locks.query();
    const live = new Set<string>();
    for (const lock of snapshot.held ?? []) {
      const key = lock.name ? recordKeyOfLockName(lock.name) : null;
      if (key !== null) {
        live.add(key);
      }
    }
    return live;
  } catch {
    return new Set();
  }
}
