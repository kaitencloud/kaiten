import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  FORM_RECOVERY_STORAGE_KEY,
  getFormRecoveryRuntime,
  resyncFormRecovery,
} from '../form-recovery-collection';
import { buildUserMarkKey } from '../form-recovery-keys';
import {
  FORM_RECOVERY_ENVELOPE,
  FORM_RECOVERY_MAX_RECORD_BYTES,
  type FormRecoveryEntry,
  type FormRecoveryRecord,
} from '../form-recovery-record';
import {
  pruneRecords,
  purgeAllFormRecovery,
} from '../form-recovery-maintenance';
import {
  discardRecord,
  markSent,
  readScope,
  removeRecord,
  replaceRecord,
  updateTombstone,
} from '../form-recovery-repository';
import { isoAfter, makeEntry, makeTombstone, NOW, SCOPE } from './test-records';

const MOUNTED_AT = NOW.toISOString();

function readBlob(): Record<string, { data: Record<string, unknown> }> {
  return JSON.parse(window.localStorage.getItem(FORM_RECOVERY_STORAGE_KEY) ?? '{}');
}

function storedKeys(): string[] {
  return Object.keys(readBlob());
}

function writeBlobDirectly(records: FormRecoveryRecord[]): void {
  const blob: Record<string, unknown> = {};
  for (const record of records) {
    blob[`s:${record.key}`] = { versionKey: crypto.randomUUID(), data: record };
  }
  window.localStorage.setItem(FORM_RECOVERY_STORAGE_KEY, JSON.stringify(blob));
}

async function persist(handle: ReturnType<typeof replaceRecord>) {
  if (!handle.written) {
    throw new Error(`refused: ${handle.reason}`);
  }
  return handle.persisted;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('replaceRecord', () => {
  it('writes the storage synchronously, and gives its verdict as a promise', async () => {
    const entry = makeEntry();

    const handle = replaceRecord(entry, { mountedAt: MOUNTED_AT });

    expect(handle.written).toBe(true);
    // No await between the call and the read: a flush on pagehide relies on it.
    expect(storedKeys()).toEqual([`s:${entry.key}`]);
    await expect(persist(handle)).resolves.toEqual({ ok: true });
  });

  it('replaces the record whole, so an entry turned tombstone keeps none of its values', async () => {
    const entry = makeEntry({
      attemptedAt: NOW.toISOString(),
      extra: '{"rows":1}',
      labels: { 'license-1': 'Gold' },
    });
    await persist(replaceRecord(entry, { mountedAt: MOUNTED_AT }));

    await persist(discardRecord(entry.key, 'discarded'));

    const stored = readBlob()[`s:${entry.key}`]!.data;
    expect(stored.kind).toBe('tombstone');
    expect(stored.reason).toBe('discarded');
    for (const gone of [
      'payload',
      'attemptedAt',
      'labels',
      'extra',
      'extraSource',
      'status',
      'attempt',
      'stepId',
      'omittedFilled',
    ]) {
      expect(stored, gone).not.toHaveProperty(gone);
    }
  });

  it('replaces an entry by another without keeping the old optional values', async () => {
    const first = makeEntry({ attemptedAt: NOW.toISOString(), extra: '{}' });
    await persist(replaceRecord(first, { mountedAt: MOUNTED_AT }));

    await persist(
      replaceRecord(
        { ...first, attemptedAt: null, extra: null, payload: '[]' },
        { mountedAt: MOUNTED_AT },
      ),
    );

    const stored = readBlob()[`s:${first.key}`]!.data;
    expect(stored.attemptedAt).toBeNull();
    expect(stored.extra).toBeNull();
    expect(stored.payload).toBe('[]');
  });

  it('refuses a write for a lineage that has a tombstone', async () => {
    const entry = makeEntry();
    writeBlobDirectly([makeTombstone({ lineageId: entry.lineageId })]);

    expect(replaceRecord(entry, { mountedAt: MOUNTED_AT })).toEqual({
      written: false,
      reason: 'tombstoned',
    });
  });

  it('sees a tombstone another tab wrote without any event, thanks to the resync', async () => {
    const entry = makeEntry();
    await persist(replaceRecord(entry, { mountedAt: MOUNTED_AT }));

    // Another tab sent the form; this tab missed the storage event (bfcache).
    writeBlobDirectly([makeTombstone({ lineageId: entry.lineageId })]);

    expect(replaceRecord(entry, { mountedAt: MOUNTED_AT })).toMatchObject({
      written: false,
      reason: 'tombstoned',
    });
  });

  it('refuses a write that was mounted before a sign-out mark', async () => {
    const entry = makeEntry();
    purgeAllFormRecovery(entry.userId, new Date(NOW.getTime() + 1_000));

    expect(
      replaceRecord(entry, { mountedAt: NOW.toISOString() }),
    ).toMatchObject({ written: false, reason: 'signed-out' });
    expect(
      replaceRecord(entry, { mountedAt: isoAfter(NOW, 2_000) }),
    ).toMatchObject({ written: true });
  });

  it('refuses a record over the limit and removes the older record of the lineage', async () => {
    const entry = makeEntry();
    await persist(replaceRecord(entry, { mountedAt: MOUNTED_AT }));

    const handle = replaceRecord(
      { ...entry, payload: 'x'.repeat(FORM_RECOVERY_MAX_RECORD_BYTES) },
      { mountedAt: MOUNTED_AT },
    );

    expect(handle).toEqual({ written: false, reason: 'too-large' });
    await vi.waitFor(() => expect(storedKeys()).toEqual([]));
  });

  it('refuses a record the schema rejects', () => {
    const handle = replaceRecord(
      { ...makeEntry(), formVersion: -1 } as FormRecoveryEntry,
      { mountedAt: MOUNTED_AT },
    );

    expect(handle).toEqual({ written: false, reason: 'invalid' });
  });

  it('reports a full quota as a verdict, rolls back, and raises nothing unhandled', async () => {
    const entry = makeEntry();
    getFormRecoveryRuntime();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    const handle = replaceRecord(entry, { mountedAt: MOUNTED_AT });

    expect(handle.written).toBe(true);
    await expect(persist(handle)).resolves.toEqual({
      ok: false,
      reason: 'quota',
    });
    expect(getFormRecoveryRuntime()?.collection.has(entry.key)).toBe(false);
  });

  it('reports another failure of the storage as unavailable', async () => {
    getFormRecoveryRuntime();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('disk on fire');
    });

    await expect(
      persist(replaceRecord(makeEntry(), { mountedAt: MOUNTED_AT })),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('inserts when another tab removed the record this tab thought was there', async () => {
    const entry = makeEntry();
    await persist(replaceRecord(entry, { mountedAt: MOUNTED_AT }));
    const collection = getFormRecoveryRuntime()!.collection;
    // The memory of this tab says "absent" while the record exists: insert races.
    vi.spyOn(collection, 'has').mockReturnValue(false);

    await expect(
      persist(replaceRecord({ ...entry, payload: '[]' }, { mountedAt: MOUNTED_AT })),
    ).resolves.toEqual({ ok: true });

    expect(readBlob()[`s:${entry.key}`]!.data.payload).toBe('[]');
  });

  it('updates into an insert when the record vanished in the meantime', async () => {
    const entry = makeEntry();
    const collection = getFormRecoveryRuntime()!.collection;
    vi.spyOn(collection, 'has').mockReturnValue(true);

    await expect(
      persist(replaceRecord(entry, { mountedAt: MOUNTED_AT })),
    ).resolves.toEqual({ ok: true });

    expect(storedKeys()).toEqual([`s:${entry.key}`]);
  });
});

describe('markSent', () => {
  it('writes a tombstone with no values, whatever the state of the entry', async () => {
    const entry = makeEntry({ status: 'submitting', attemptedAt: NOW.toISOString() });
    await persist(replaceRecord(entry, { mountedAt: MOUNTED_AT }));

    await persist(
      markSent({
        scope: { ...SCOPE, lineageId: entry.lineageId },
        at: NOW,
        created: { id: 'gold', label: 'Gold' },
        followUp: true,
      }),
    );

    const stored = readBlob()[`s:${entry.key}`]!.data;
    expect(stored).toMatchObject({
      kind: 'tombstone',
      reason: 'sent',
      created: { id: 'gold', label: 'Gold' },
      followUp: true,
      followUpSeen: false,
    });
    expect(stored).not.toHaveProperty('payload');
    expect(stored).not.toHaveProperty('attemptedAt');
    expect(stored.expiresAt).toBe(isoAfter(NOW, 24 * 3_600_000));
  });

  it('is not stopped by a discard, a sign-out mark or a missing entry', async () => {
    const entry = makeEntry();
    writeBlobDirectly([makeTombstone({ lineageId: entry.lineageId, reason: 'discarded' })]);
    purgeAllFormRecovery(null);
    writeBlobDirectly([makeTombstone({ lineageId: entry.lineageId, reason: 'discarded' })]);
    resyncFormRecovery();

    await persist(
      markSent({
        scope: { ...SCOPE, lineageId: entry.lineageId },
        at: NOW,
        created: null,
        followUp: false,
      }),
    );

    expect(readBlob()[`s:${entry.key}`]!.data.reason).toBe('sent');
  });
});

describe('discardRecord, removeRecord and updateTombstone', () => {
  it('has nothing to discard when nothing was stored', () => {
    expect(discardRecord('nothing', 'discarded')).toEqual({
      written: false,
      reason: 'missing',
    });
  });

  it('does not turn a tombstone into another tombstone', async () => {
    const tombstone = makeTombstone();
    writeBlobDirectly([tombstone]);

    expect(discardRecord(tombstone.key, 'discarded')).toEqual({
      written: false,
      reason: 'tombstoned',
    });
  });

  it('removes an entry outright', async () => {
    const entry = makeEntry();
    await persist(replaceRecord(entry, { mountedAt: MOUNTED_AT }));

    await persist(removeRecord(entry.key));

    expect(storedKeys()).toEqual([]);
    expect(removeRecord(entry.key)).toEqual({ written: false, reason: 'missing' });
  });

  it('marks the notice of an unfinished chain as seen', async () => {
    const tombstone = makeTombstone({ followUp: true });
    writeBlobDirectly([tombstone]);

    await persist(updateTombstone(tombstone.key, { followUpSeen: true }));

    expect(readBlob()[`s:${tombstone.key}`]!.data).toMatchObject({
      followUp: true,
      followUpSeen: true,
    });
  });
});

describe('readScope', () => {
  it('returns the entries and tombstones of the scope only', () => {
    const mine = makeEntry({ lineageId: 'a' });
    const otherForm = makeEntry({ lineageId: 'b', formId: 'other.create' });
    const otherContext = makeEntry({ lineageId: 'c', context: 'customer:1' });
    const otherUser = makeEntry({ lineageId: 'd', userId: 'user_2' });
    const otherOrg = makeEntry({ lineageId: 'e', organizationId: 'org_2' });
    const tombstone = makeTombstone({ lineageId: 'f' });
    writeBlobDirectly([mine, otherForm, otherContext, otherUser, otherOrg, tombstone]);

    const snapshot = readScope(SCOPE, NOW);

    expect(snapshot.entries.map((entry) => entry.lineageId)).toEqual(['a']);
    expect(snapshot.tombstones.map((entry) => entry.lineageId)).toEqual(['f']);
  });

  it('removes what has expired, silently, and does not return it', async () => {
    const live = makeEntry({ lineageId: 'live' });
    const expired = makeEntry({
      lineageId: 'old',
      expiresAt: isoAfter(NOW, -1_000),
    });
    writeBlobDirectly([live, expired]);

    const snapshot = readScope(SCOPE, NOW);

    expect(snapshot.entries.map((entry) => entry.lineageId)).toEqual(['live']);
    await vi.waitFor(() => expect(storedKeys()).toEqual([`s:${live.key}`]));
  });

  it('removes a record of another envelope or an invalid shape', async () => {
    const live = makeEntry({ lineageId: 'live' });
    const old = makeEntry({ lineageId: 'old' });
    const blob = {
      [`s:${live.key}`]: { versionKey: 'v1', data: live },
      [`s:${old.key}`]: {
        versionKey: 'v2',
        data: { ...old, envelope: FORM_RECOVERY_ENVELOPE + 1 },
      },
      's:broken': { versionKey: 'v3', data: { kind: 'entry', key: 'broken' } },
    };
    window.localStorage.setItem(FORM_RECOVERY_STORAGE_KEY, JSON.stringify(blob));
    getFormRecoveryRuntime();

    const snapshot = readScope(SCOPE, NOW);

    expect(snapshot.entries.map((entry) => entry.lineageId)).toEqual(['live']);
    await vi.waitFor(() => expect(storedKeys()).toEqual([`s:${live.key}`]));
  });

  it('survives a corrupt blob: an empty scope, and the next write repairs the key', async () => {
    window.localStorage.setItem(FORM_RECOVERY_STORAGE_KEY, '{not json');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(readScope(SCOPE, NOW).entries).toEqual([]);

    await persist(replaceRecord(makeEntry(), { mountedAt: MOUNTED_AT }));
    expect(storedKeys()).toHaveLength(1);
  });

  it('returns the sign-out mark of the user', () => {
    purgeAllFormRecovery(SCOPE.userId, NOW);

    expect(readScope(SCOPE, NOW).userMark).toMatchObject({
      kind: 'userMark',
      userId: SCOPE.userId,
      signedOutAt: NOW.toISOString(),
    });
    expect(readScope({ ...SCOPE, userId: 'user_2' }, NOW).userMark).toBeNull();
  });

  it('sees a record another tab wrote with no event, after the resync', () => {
    getFormRecoveryRuntime();
    const entry = makeEntry();

    writeBlobDirectly([entry]);

    expect(readScope(SCOPE, NOW).entries).toHaveLength(1);
  });
});

describe('resyncFormRecovery', () => {
  it('reads a blob that was written directly, with no storage event', () => {
    const runtime = getFormRecoveryRuntime()!;
    const entry = makeEntry();
    expect(runtime.collection.has(entry.key)).toBe(false);

    writeBlobDirectly([entry]);
    expect(runtime.collection.has(entry.key)).toBe(false);

    resyncFormRecovery();
    expect(runtime.collection.has(entry.key)).toBe(true);
  });

  it('follows a storage event dispatched on the window, as another tab sends one', () => {
    const runtime = getFormRecoveryRuntime()!;
    const entry = makeEntry();

    writeBlobDirectly([entry]);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: FORM_RECOVERY_STORAGE_KEY,
        storageArea: window.localStorage,
      }),
    );

    expect(runtime.collection.has(entry.key)).toBe(true);
  });
});

describe('pruneRecords', () => {
  const none = new Set<string>();

  it('removes the expired, the invalid and the records of other users', async () => {
    const mine = makeEntry({ lineageId: 'mine' });
    const expired = makeEntry({ lineageId: 'old', expiresAt: isoAfter(NOW, -1) });
    const foreign = makeEntry({ lineageId: 'foreign', userId: 'user_2' });
    const foreignMark: FormRecoveryRecord = {
      kind: 'userMark',
      key: buildUserMarkKey('user_2'),
      envelope: FORM_RECOVERY_ENVELOPE,
      userId: 'user_2',
      signedOutAt: NOW.toISOString(),
      expiresAt: isoAfter(NOW, 1_000),
    };
    writeBlobDirectly([mine, expired, foreign, foreignMark]);
    getFormRecoveryRuntime();

    await pruneRecords(NOW, { userId: SCOPE.userId, organizationId: 'org_1' }, none);

    expect(storedKeys()).toEqual([`s:${mine.key}`]);
  });

  it('keeps the records of every user when no identity is known', async () => {
    const foreign = makeEntry({ lineageId: 'foreign', userId: 'user_2' });
    writeBlobDirectly([foreign]);
    getFormRecoveryRuntime();

    await pruneRecords(NOW, null, none);

    expect(storedKeys()).toEqual([`s:${foreign.key}`]);
  });

  it('writes nothing when there is nothing to remove', async () => {
    writeBlobDirectly([makeEntry()]);
    getFormRecoveryRuntime();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    await pruneRecords(NOW, { userId: SCOPE.userId, organizationId: 'org_1' }, none);

    expect(setItem).not.toHaveBeenCalled();
  });

  it('evicts the oldest entry of a scope beyond three, as a tombstone, and spares a held one', async () => {
    const entries = ['a', 'b', 'c', 'd'].map((lineageId, index) =>
      makeEntry({ lineageId, updatedAt: isoAfter(NOW, index * 1_000) }),
    );
    writeBlobDirectly(entries);
    getFormRecoveryRuntime();

    // `a` is the oldest but a tab holds it: `b` goes instead.
    await pruneRecords(NOW, null, new Set([entries[0]!.key]));

    const blob = readBlob();
    expect(blob[`s:${entries[0]!.key}`]!.data.kind).toBe('entry');
    expect(blob[`s:${entries[1]!.key}`]!.data).toMatchObject({
      kind: 'tombstone',
      reason: 'evicted',
    });
    expect(blob[`s:${entries[2]!.key}`]!.data.kind).toBe('entry');
    expect(blob[`s:${entries[3]!.key}`]!.data.kind).toBe('entry');
  });

  it('evicts the oldest entries of the browser beyond twenty', async () => {
    const entries = Array.from({ length: 22 }, (_, index) =>
      makeEntry({
        lineageId: `l${index}`,
        formId: `form-${index}`,
        updatedAt: isoAfter(NOW, index * 1_000),
      }),
    );
    writeBlobDirectly(entries);
    getFormRecoveryRuntime();

    await pruneRecords(NOW, null, none);

    const blob = readBlob();
    const live = Object.values(blob).filter(({ data }) => data.kind === 'entry');
    expect(live).toHaveLength(20);
    expect(blob[`s:${entries[0]!.key}`]!.data.reason).toBe('evicted');
    expect(blob[`s:${entries[1]!.key}`]!.data.reason).toBe('evicted');
  });
});

describe('purgeAllFormRecovery', () => {
  it('removes everything and leaves a mark for the user', async () => {
    writeBlobDirectly([makeEntry({ lineageId: 'a' }), makeTombstone({ lineageId: 'b' })]);
    getFormRecoveryRuntime();

    purgeAllFormRecovery(SCOPE.userId, NOW);

    expect(storedKeys()).toEqual([`s:${buildUserMarkKey(SCOPE.userId)}`]);
  });

  it('removes everything and leaves no mark when no one is known', () => {
    writeBlobDirectly([makeEntry()]);
    getFormRecoveryRuntime();

    purgeAllFormRecovery(null);

    expect(storedKeys()).toEqual([]);
  });
});
