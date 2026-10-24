import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { logger } from '@/lib/logger';
import { makeEntry } from '@/lib/form-recovery/__tests__/test-records';
import {
  IDENTITY,
  mountSession,
  otherTabEvent,
  seedEntry,
  snapshotOf,
  storedRecords,
  track,
} from './session-helpers';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date('2026-10-23T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('write machine', () => {
  it('starts idle, writes nothing for a blank form, and offers nothing', async () => {
    const h = mountSession();
    await advance(0);

    expect(h.state().writer).toEqual({ status: 'idle' });
    track(h, snapshotOf([]), false);
    await advance(2_000);

    expect(h.state().writer).toEqual({ status: 'idle' });
    expect(storedRecords()).toEqual({});
  });

  it('goes dirty on a change that counts and writes after a second', async () => {
    const h = mountSession();
    await advance(0);

    track(h, snapshotOf([['name', 'Gold']]), false);
    expect(h.state().writer).toEqual({ status: 'dirty' });
    await advance(999);
    expect(storedRecords()).toEqual({});

    await advance(1);
    const [entry] = Object.values(storedRecords());
    expect(entry).toMatchObject({
      kind: 'entry',
      status: 'editing',
      formVersion: 1,
      userId: IDENTITY.userId,
      organizationId: IDENTITY.organizationId,
      formId: 'things.create',
      attempt: 0,
      attemptedAt: null,
    });
    expect(entry!.payload).toBe('[["name","Gold"]]');
    expect(h.state().writer).toEqual({ status: 'saved' });
  });

  it('restarts the delay on each change and writes the last one', async () => {
    const h = mountSession();
    await advance(0);

    track(h, snapshotOf([['name', 'G']]), false);
    await advance(600);
    track(h, snapshotOf([['name', 'Gold']]), false);
    await advance(600);
    expect(storedRecords()).toEqual({});

    await advance(400);
    expect(Object.values(storedRecords())[0]!.payload).toBe('[["name","Gold"]]');
  });

  it('writes at once on a step change, and not again when nothing changed', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(Object.values(storedRecords())[0]!.stepId).toBe('identity');

    track(h, snapshotOf([['name', 'Gold']], { stepId: 'details', furthestStepId: 'details' }), true);
    expect(Object.values(storedRecords())[0]!.stepId).toBe('details');

    setItem.mockClear();
    track(h, snapshotOf([['name', 'Gold']], { stepId: 'details', furthestStepId: 'details' }), true);
    await advance(2_000);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('flushes on pagehide, on a hidden page and on unmount, and only what is pending', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), false);
    expect(storedRecords()).toEqual({});

    window.dispatchEvent(new Event('pagehide'));
    expect(Object.keys(storedRecords())).toHaveLength(1);

    track(h, snapshotOf([['name', 'Golden']]), false);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(Object.values(storedRecords())[0]!.payload).toBe('[["name","Golden"]]');

    track(h, snapshotOf([['name', 'Goldenest']]), false);
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    expect(Object.values(storedRecords())[0]!.payload).toBe('[["name","Goldenest"]]');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('removes the record when the form returns to its initial values', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);
    expect(Object.keys(storedRecords())).toHaveLength(1);

    track(h, snapshotOf([]), false);
    await advance(10);

    expect(storedRecords()).toEqual({});
    expect(h.state().writer).toEqual({ status: 'idle' });
  });

  it('is disabled without being enabled, without an identity, or without a storage', async () => {
    for (const overrides of [{ enabled: false }, { identity: null }]) {
      const h = mountSession(overrides);
      await advance(0);

      expect(h.state().writer).toEqual({ status: 'disabled' });
      track(h, snapshotOf([['name', 'Gold']]), true);
      expect(storedRecords()).toEqual({});
    }

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { resetFormRecoveryForTests } = await import('@/lib/form-recovery');
    resetFormRecoveryForTests();
    expect(mountSession().state().writer).toEqual({ status: 'disabled' });
  });

  it('does not create the collection for a session that is not enabled', async () => {
    const { formRecoveryCollectionExists } = await import('@/lib/form-recovery');
    const h = mountSession({ enabled: false });
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);
    await h.session.actions.send(() => Promise.resolve(1));

    expect(formRecoveryCollectionExists()).toBe(false);
  });
});

describe('write machine under quota', () => {
  it('evicts the oldest entry then retries, once', async () => {
    seedEntry(makeEntry({ lineageId: 'stale', formId: 'other.create' }));
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);
    await advance(0);
    expect(Object.keys(storedRecords())).toHaveLength(2);

    // Storage is full for the first attempt only.
    const real = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      calls += 1;
      if (calls === 1) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, key, value);
    });

    track(h, snapshotOf([['name', 'Golden']]), true);
    await advance(50);

    const records = storedRecords();
    expect(records.stale).toMatchObject({ kind: 'tombstone', reason: 'evicted' });
    const own = Object.values(records).find((record) => record.kind === 'entry');
    expect(own!.payload).toBe('[["name","Golden"]]');
    expect(h.state().writer.status).toBe('saved');
  });

  it('gives up quietly when nothing can be freed: the lineage is removed and the writer paused', async () => {
    const h = mountSession();
    await advance(0);
    // A first version is stored: the failure of the next write must not leave it behind.
    track(h, snapshotOf([['name', 'Gold']]), true);
    await advance(50);
    const { lineageId } = h.state();
    expect(storedRecords()[lineageId]).toMatchObject({ kind: 'entry' });

    // The storage refuses what holds the new value and takes what frees space.
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (value.includes('Golden')) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, key, value);
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    track(h, snapshotOf([['name', 'Golden']]), true);
    await advance(100);

    expect(h.state().writer).toEqual({ status: 'paused', reason: 'quota' });
    expect(storedRecords()).toEqual({});
    // Said once, with the form and nothing of what was typed.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String), { formId: 'things.create' });
  });

  it('keeps an entry for the evicted one to take the place of when the retry fits', async () => {
    seedEntry(makeEntry({ lineageId: 'stale', formId: 'other.create' }));
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);
    await advance(0);
    const { lineageId } = h.state();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const real = Storage.prototype.setItem;
    let refused = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (value.includes('Golden') && refused === 0) {
        refused += 1;
        throw new DOMException('full', 'QuotaExceededError');
      }
      return real.call(this, key, value);
    });

    track(h, snapshotOf([['name', 'Golden']]), true);
    await advance(100);

    // Room was made: the entry is the new version, not removed, and nothing is said.
    expect(storedRecords()[lineageId]).toMatchObject({ kind: 'entry', payload: '[["name","Golden"]]' });
    expect(h.state().writer.status).toBe('saved');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('limits while the page lives', () => {
  it('evicts the oldest lineages beyond three when a new one is created', async () => {
    const day = 24 * 3_600_000;
    for (let i = 0; i < 4; i += 1) {
      seedEntry(
        makeEntry({
          lineageId: `old-${i}`,
          formId: 'things.create',
          updatedAt: new Date(Date.now() - (10 - i) * 1_000).toISOString(),
          expiresAt: new Date(Date.now() + 7 * day).toISOString(),
        }),
      );
    }
    const h = mountSession();
    await advance(0);

    track(h, snapshotOf([['name', 'Gold']]), true);
    await advance(50);

    const records = Object.values(storedRecords());
    expect(records.filter((record) => record.kind === 'entry')).toHaveLength(3);
    expect(records.find((record) => record.lineageId === h.state().lineageId)).toMatchObject({
      kind: 'entry',
    });
    expect(records.find((record) => record.lineageId === 'old-0')).toMatchObject({
      kind: 'tombstone',
      reason: 'evicted',
    });
    h.dispose();
  });
});

describe('tabs', () => {
  it('goes to sentElsewhere when another tab sent this lineage', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);
    const [entry] = Object.values(storedRecords());

    const { markSent } = await import('@/lib/form-recovery');
    markSent({
      scope: { ...IDENTITY, formId: 'things.create', context: '', lineageId: entry!.lineageId },
      at: new Date(),
      created: { id: 'gold', label: 'Gold' },
      followUp: false,
    });
    otherTabEvent();
    await advance(50);

    expect(h.state().writer).toEqual({ status: 'sentElsewhere' });
    // Nothing is written afterwards, whatever the person types.
    track(h, snapshotOf([['name', 'Golden']]), true);
    expect(Object.values(storedRecords())[0]!.kind).toBe('tombstone');
  });

  it('pauses with notKept:discarded when another tab discarded it, and writes nothing without a click', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);
    const [entry] = Object.values(storedRecords());

    const { discardRecord } = await import('@/lib/form-recovery');
    discardRecord(entry!.key, 'discarded');
    otherTabEvent();
    await advance(50);

    expect(h.state().writer).toEqual({ status: 'paused', reason: 'discarded' });
    track(h, snapshotOf([['name', 'Golden']]), true);
    await advance(2_000);
    expect(Object.values(storedRecords())[0]!.kind).toBe('tombstone');

    h.session.actions.keepHere();
    await advance(50);
    const live = Object.values(storedRecords()).filter((r) => r.kind === 'entry');
    expect(live).toHaveLength(1);
    expect(live[0]!.lineageId).not.toBe(entry!.lineageId);
    expect(h.state().writer.status).toBe('saved');
  });

  it('heals a race that wiped its record, when it saw the record less than a day ago', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);
    expect(Object.keys(storedRecords())).toHaveLength(1);

    // Another process rewrote the blob without it, and left no trace.
    window.localStorage.removeItem('kaiten:form-recovery');
    otherTabEvent();
    await advance(50);

    expect(Object.values(storedRecords())[0]!.payload).toBe('[["name","Gold"]]');
    expect(h.state().writer.status).toBe('saved');
  });

  it('does not heal after a day: paused with notKept:unknown, and "keep here" begins a new lineage', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);
    const [entry] = Object.values(storedRecords());

    await advance(25 * 3_600_000);
    window.localStorage.removeItem('kaiten:form-recovery');
    otherTabEvent();
    await advance(50);

    expect(h.state().writer).toEqual({ status: 'paused', reason: 'unknown' });
    expect(storedRecords()).toEqual({});

    h.session.actions.keepHere();
    await advance(50);
    expect(Object.values(storedRecords())[0]!.lineageId).not.toBe(entry!.lineageId);
  });

  it('goes disabled, and writes nothing, after a sign-out in another tab', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]), true);

    const { purgeAllFormRecovery } = await import('@/lib/form-recovery');
    await advance(10);
    purgeAllFormRecovery(IDENTITY.userId, new Date());
    otherTabEvent();
    await advance(50);

    expect(h.state().writer).toEqual({ status: 'disabled' });
    track(h, snapshotOf([['name', 'Golden']]), true);
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    expect(Object.values(storedRecords()).every((record) => record.kind === 'userMark')).toBe(true);
  });

  it('flushes the last input of a session that merely expired, as nothing marks a sign-out', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]));

    // The session expired: the app unmounts, and the typed input is kept.
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());

    expect(Object.values(storedRecords())[0]).toMatchObject({
      kind: 'entry',
      payload: '[["name","Gold"]]',
    });
  });

  it('writes nothing once a sign-out marked the user, even on the flush of the unmount', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'Gold']]));
    await advance(10);

    const { purgeAllFormRecovery } = await import('@/lib/form-recovery');
    purgeAllFormRecovery(IDENTITY.userId, new Date());
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    await advance(5_000);

    expect(Object.values(storedRecords()).every((record) => record.kind === 'userMark')).toBe(true);
  });

  it('does not touch a lineage another tab sends or discards', async () => {
    const a = mountSession();
    const b = mountSession();
    await advance(0);
    track(a, snapshotOf([['name', 'A']]), true);
    track(b, snapshotOf([['name', 'B']]), true);
    expect(Object.keys(storedRecords())).toHaveLength(2);

    await a.session.actions.send(() => Promise.resolve(1));
    otherTabEvent();
    await advance(50);

    expect(b.state().writer.status).toBe('saved');
  });
});
