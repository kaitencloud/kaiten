import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { encodePayload } from '@/lib/form-recovery';
import { buildLockName } from '@/lib/form-recovery/form-recovery-keys';
import {
  isoAfter,
  makeEntry,
  makeTombstone,
  NOW,
} from '@/lib/form-recovery/__tests__/test-records';
import { defineFormRecovery } from '../define-form-recovery';
import { selectNotices, selectOffer } from '../logic/selectors';
import { useFakeLocks } from './fake-locks';
import {
  IDENTITY,
  mountSession,
  otherTabEvent,
  seedEntry,
  snapshotOf,
  storedRecords,
  thingRecovery,
  track,
  type Harness,
} from './session-helpers';

const fake = useFakeLocks();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

const info = {
  version: 1,
  steps: ['identity', 'details'],
  stepFields: { identity: ['name'], details: ['count', 'note'] },
};

function offerOf(h: Harness) {
  return selectOffer(h.state(), info);
}

function entry(overrides: Parameters<typeof makeEntry>[0] = {}) {
  return makeEntry({
    formId: 'things.create',
    payload: encodePayload([['name', 'Gold']]),
    stepId: 'details',
    furthestStepId: 'details',
    stepIds: ['identity', 'details'],
    expiresAt: isoAfter(NOW, 7 * 24 * 3_600_000),
    ...overrides,
  });
}

async function mount(overrides: Parameters<typeof mountSession>[0] = {}) {
  const h = mountSession(overrides);
  await advance(0);
  return h;
}

describe('the offer', () => {
  it('offers the latest entry with its step, once the locks are known', async () => {
    seedEntry(entry({ lineageId: 'old', updatedAt: isoAfter(NOW, -5_000) }));
    seedEntry(entry({ lineageId: 'new', updatedAt: isoAfter(NOW, -1_000) }));

    const h = mountSession();
    expect(offerOf(h)).toBeNull(); // the locks have not answered yet
    await advance(0);

    expect(offerOf(h)).toEqual({
      kind: 'resumable',
      savedAt: isoAfter(NOW, -1_000),
      stepIndex: 1,
      stepCount: 2,
      omittedFilled: [],
      formChanged: false,
      others: 1,
    });
  });

  it('offers nothing when there is nothing, and writes nothing for it', async () => {
    const h = await mount();

    expect(offerOf(h)).toBeNull();
    expect(storedRecords()).toEqual({});
  });

  it.each([
    ['another user', { userId: 'user_2' }],
    ['another organization', { organizationId: 'org_2' }],
    ['another form', { formId: 'other.create' }],
    ['another context', { context: 'customer:1' }],
  ])('does not offer the entry of %s', async (_name, overrides) => {
    seedEntry(entry({ lineageId: 'foreign', ...overrides }));

    const h = await mount();

    expect(offerOf(h)).toBeNull();
  });

  it('does not offer an expired entry, and removes it', async () => {
    seedEntry(entry({ expiresAt: isoAfter(NOW, -1) }));

    const h = await mount();

    expect(offerOf(h)).toBeNull();
    await advance(10);
    expect(storedRecords()).toEqual({});
  });

  it('does not offer a lineage that has a tombstone', async () => {
    seedEntry(entry({ lineageId: 'a' }) as never);
    const tombstone = makeTombstone({ formId: 'things.create', lineageId: 'a' });
    window.localStorage.setItem(
      'kaiten:form-recovery',
      JSON.stringify({ [`s:${tombstone.key}`]: { versionKey: 'v', data: tombstone } }),
    );

    const h = await mount();

    expect(offerOf(h)).toBeNull();
  });

  it('flags a form that changed since, and an entry that had a send without verdict', async () => {
    seedEntry(entry({ formVersion: 0 }));
    expect(offerOf(await mount())).toMatchObject({ kind: 'resumable', formChanged: true });
  });

  it.each([
    ['submitting', { status: 'submitting' as const }],
    ['with an attemptedAt', { attemptedAt: isoAfter(NOW, -2_000) }],
  ])('offers an entry %s as "may have gone through"', async (_name, overrides) => {
    seedEntry(entry(overrides));

    expect(offerOf(await mount())).toMatchObject({ kind: 'uncertain' });
  });

  it('lists the never-kept fields the person had filled', async () => {
    seedEntry(entry({ omittedFilled: ['secret'] }));

    expect(offerOf(await mount())).toMatchObject({ omittedFilled: ['secret'] });
  });

  it('drops an entry of an incompatible version and says so once', async () => {
    const strict = defineFormRecovery<{ name: string; count: number; note: string; secret: string }>({
      ...thingRecovery,
      version: 2,
      incompatibleBelow: 2,
    });
    seedEntry(entry({ formVersion: 1, updatedAt: isoAfter(NOW, -1_000) }));

    const h = await mount({ descriptor: strict });

    expect(offerOf(h)).toBeNull();
    expect(h.state().lost).toEqual({ savedAt: isoAfter(NOW, -1_000) });
    expect(selectNotices(h.state())).toContainEqual({ kind: 'lost', savedAt: isoAfter(NOW, -1_000) });
    await advance(10);
    expect(storedRecords()).toEqual({});

    h.session.actions.dismiss('lost');
    expect(h.state().lost).toBeNull();
    h.dispose(); // a session left alive would answer the next test's events
  });

  it('leaves an incompatible entry alone while another tab holds it', async () => {
    const strict = defineFormRecovery<{ name: string; count: number; note: string; secret: string }>({
      ...thingRecovery,
      version: 2,
      incompatibleBelow: 2,
    });
    const old = entry({ lineageId: 'old-bundle', formVersion: 1 });
    seedEntry(old);
    fake.held.set(buildLockName(old.key), () => {}); // a tab still on the old bundle

    const h = await mount({ descriptor: strict });
    await advance(10);

    expect(storedRecords()['old-bundle']).toMatchObject({ kind: 'entry' });
    expect(offerOf(h)).toBeNull();
    expect(h.state().lost).toBeNull();
    expect(h.state().openElsewhere).toBe(true);

    fake.held.clear(); // that tab closed
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(10);

    expect(storedRecords()).toEqual({});
    expect(h.state().lost).not.toBeNull();
    h.dispose();
  });

  it('does not touch the offer when the person types in the blank form: it shrinks to a line, and both are kept', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();

    track(h, snapshotOf([['name', 'Silver']]), true);

    expect(offerOf(h)).toMatchObject({ kind: 'condensed' });
    const records = Object.values(storedRecords());
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.kind === 'entry')).toBe(true);
    expect(storedRecords().old!.payload).toBe(encodePayload([['name', 'Gold']]));
  });

  it('hides the reduced offer after three more changes, but keeps the entry', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    track(h, snapshotOf([['name', 'a']]), false);

    for (const name of ['b', 'c', 'd']) {
      track(h, snapshotOf([['name', name]]), false);
      expect(offerOf(h)).toMatchObject({ kind: 'condensed' });
    }
    track(h, snapshotOf([['name', 'e']]), false);

    expect(offerOf(h)).toBeNull();
    expect(storedRecords().old).toBeDefined();
  });

  it('keeps the original offer for the next visit after a stray keystroke that is erased', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    track(h, snapshotOf([['name', 'x']]), true);
    track(h, snapshotOf([]), true);
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    h.dispose();

    const again = await mount();

    expect(offerOf(again)).toMatchObject({ kind: 'resumable', others: 0 });
    expect(Object.keys(storedRecords())).toEqual(['old']);
  });

  it('cycles through the other entries with "show the next one"', async () => {
    seedEntry(entry({ lineageId: 'a', updatedAt: isoAfter(NOW, -1_000) }));
    seedEntry(entry({ lineageId: 'b', updatedAt: isoAfter(NOW, -2_000) }));
    const h = await mount();

    expect(offerOf(h)).toMatchObject({ savedAt: isoAfter(NOW, -1_000), others: 1 });
    h.session.actions.showOther();
    expect(offerOf(h)).toMatchObject({ savedAt: isoAfter(NOW, -2_000) });
    h.session.actions.showOther();
    expect(offerOf(h)).toMatchObject({ savedAt: isoAfter(NOW, -1_000) });
  });
});

describe('resume', () => {
  it('restores on the initial values of today, lands on the step, and adopts the lineage', async () => {
    seedEntry(entry({ lineageId: 'old', omittedFilled: ['secret'] }));
    const h = await mount();
    const before = h.state().generation;

    h.session.actions.resume();
    await advance(10);

    expect(h.state().restored).toMatchObject({
      values: { name: 'Gold', secret: '' },
      stepIndex: 1,
      furthestIndex: 1,
    });
    expect(h.state().generation).toBe(before + 1);
    expect(h.state().lineageId).toBe('old');
    expect(h.state().writer).toEqual({ status: 'saved' });
    expect(h.state().omittedReminder).toEqual(['secret']);
    expect(h.state().focusToken).toBeGreaterThan(0);
    expect(offerOf(h)).toBeNull();
  });

  it('lands on the earlier step that holds a field to correct', async () => {
    seedEntry(entry({ payload: encodePayload([['name', 'Gold'], ['count', 'not a number']]) }));
    const h = await mount();

    h.session.actions.resume();
    await advance(10);

    // A string where the form holds a number: reset, with a note.
    expect(h.state().restored?.values.count).toBeNaN();
    expect(h.state().notes).toHaveLength(1);
  });

  it('does not rewrite an entry it restores unchanged', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    h.session.actions.resume();
    await advance(10);
    const stored = window.localStorage.getItem('kaiten:form-recovery');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    track(h, snapshotOf([['name', 'Gold']], { stepId: 'details', furthestStepId: 'details' }), true);
    await advance(2_000);

    expect(window.localStorage.getItem('kaiten:form-recovery')).toBe(stored);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('removes an entry that cannot be read back and offers the next', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedEntry(entry({ lineageId: 'broken', payload: '{nope', updatedAt: isoAfter(NOW, -1_000) }));
    seedEntry(entry({ lineageId: 'fine', updatedAt: isoAfter(NOW, -2_000) }));
    const h = await mount();

    h.session.actions.resume();
    await advance(10);

    expect(h.state().restored).toBeNull();
    expect(storedRecords().broken).toBeUndefined();
    expect(offerOf(h)).toMatchObject({ kind: 'resumable' });
  });

  it('does not restore an entry another tab sent in the meantime', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    const sent = makeTombstone({ formId: 'things.create', lineageId: 'old' });
    window.localStorage.setItem(
      'kaiten:form-recovery',
      JSON.stringify({ [`s:${sent.key}`]: { versionKey: 'v', data: sent } }),
    );
    // No storage event reached this tab (bfcache): resume still refuses.

    h.session.actions.resume();
    await advance(10);

    expect(h.state().restored).toBeNull();
    expect(offerOf(h)).toBeNull();
  });

  it('does not restore an entry another tab sent while the lock was awaited', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    const request = fake.manager.request;
    vi.spyOn(fake.manager, 'request').mockImplementation(async (...args) => {
      const sent = makeTombstone({ formId: 'things.create', lineageId: 'old' });
      window.localStorage.setItem(
        'kaiten:form-recovery',
        JSON.stringify({ [`s:${sent.key}`]: { versionKey: 'v', data: sent } }),
      );
      return request(...args);
    });

    h.session.actions.resume();
    await advance(10);

    expect(h.state().restored).toBeNull();
    expect(h.state().generation).toBe(0);
    expect(storedRecords().old).toMatchObject({ kind: 'tombstone', reason: 'sent' });
    expect(fake.held.size).toBe(0);
    expect(offerOf(h)).toBeNull();
  });

  it('acknowledges a send left without verdict', async () => {
    seedEntry(entry({ lineageId: 'old', attemptedAt: isoAfter(NOW, -2_000) }));
    const h = await mount();

    h.session.actions.resume();
    await advance(10);

    expect(storedRecords().old).toMatchObject({ attemptedAt: null, status: 'editing' });
  });
});

describe('start over', () => {
  it('discards the entry on offer, tells so, and lets a new input begin protected', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();

    h.session.actions.startOver();
    await advance(10);

    expect(storedRecords().old).toMatchObject({ kind: 'tombstone', reason: 'discarded' });
    expect(h.notify).toHaveBeenCalledWith('discarded', expect.any(Function));
    expect(offerOf(h)).toBeNull();
    expect(h.state().writer).toEqual({ status: 'idle' });

    track(h, snapshotOf([['name', 'Silver']]), true);
    expect(h.state().writer).toEqual({ status: 'saved' });
    const own = Object.values(storedRecords()).find((record) => record.kind === 'entry');
    expect(own!.payload).toBe(encodePayload([['name', 'Silver']]));
  });

  it('brings the entry back with the undo of the toast: as an offer if nothing was typed', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    h.session.actions.startOver();
    await advance(10);

    (h.notify.mock.calls[0]![1] as () => void)();
    await advance(10);

    expect(offerOf(h)).toMatchObject({ kind: 'resumable' });
  });

  it('brings it back as a reduced offer if something was typed since, without touching the new input', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    h.session.actions.startOver();
    await advance(10);
    track(h, snapshotOf([['name', 'Silver']]), true);

    (h.notify.mock.calls[0]![1] as () => void)();
    await advance(10);

    expect(offerOf(h)).toMatchObject({ kind: 'condensed' });
    const own = Object.values(storedRecords()).filter(
      (record) => record.kind === 'entry' && record.payload === encodePayload([['name', 'Silver']]),
    );
    expect(own).toHaveLength(1);
  });

  it('does not lock the new input: a keystroke after "start over" writes, but after "cancel" it does not', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    h.session.actions.startOver();
    await advance(10);
    track(h, snapshotOf([['name', 'x']]), true);
    expect(h.state().writer.status).toBe('saved');
  });
});

describe('bring them back, from the reduced offer', () => {
  it('replaces the input in progress, with an undo, and adopts the one set aside', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = await mount();
    track(h, snapshotOf([['name', 'Silver']]), true);
    const own = Object.values(storedRecords()).find((record) => record.payload === encodePayload([['name', 'Silver']]))!;

    h.session.actions.restoreSetAside();
    await advance(10);

    expect(h.state().lineageId).toBe('old');
    expect(h.state().restored?.values.name).toBe('Gold');
    expect(storedRecords()[own.lineageId]).toMatchObject({ kind: 'tombstone', reason: 'discarded' });
    expect(h.notify).toHaveBeenCalledWith('replaced', expect.any(Function));
  });
});

describe('several tabs', () => {
  it('does not offer an input another tab holds, and says it is open elsewhere', async () => {
    const a = await mount();
    track(a, snapshotOf([['name', 'A']]), true);
    await advance(10);

    const b = await mount();

    expect(offerOf(b)).toBeNull();
    expect(selectNotices(b.state())).toContainEqual({ kind: 'openElsewhere' });
    expect(b.state().writer).toEqual({ status: 'idle' });
  });

  it('lets two tabs create two objects without pausing either', async () => {
    const a = await mount();
    const b = await mount();

    track(a, snapshotOf([['name', 'A']]), true);
    track(b, snapshotOf([['name', 'B']]), true);
    await advance(100);

    expect(a.state().writer.status).toBe('saved');
    expect(b.state().writer.status).toBe('saved');
    expect(Object.values(storedRecords()).filter((record) => record.kind === 'entry')).toHaveLength(2);
  });

  it('refuses to resume an input another tab took first, and moves on', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const a = await mount();
    const b = await mount();
    expect(offerOf(a)).not.toBeNull();
    expect(offerOf(b)).not.toBeNull();

    a.session.actions.resume();
    await advance(10);
    b.session.actions.resume();
    await advance(10);

    expect(a.state().lineageId).toBe('old');
    expect(b.state().restored).toBeNull();
    expect(offerOf(b)).toBeNull();
    expect(selectNotices(b.state())).toContainEqual({ kind: 'openElsewhere' });
  });

  it('offers an input again once the tab that held it is gone', async () => {
    const a = await mount();
    track(a, snapshotOf([['name', 'A']]), true);
    await advance(10);
    a.session.actions.flushOnUnmount(a.session.actions.getEpoch());
    fake.held.clear(); // the tab crashed: the browser released its lock

    const b = await mount();

    expect(offerOf(b)).toMatchObject({ kind: 'resumable' });
  });

  it('takes an offer back when its owner is no longer there after a change event', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const b = await mount();
    expect(offerOf(b)).not.toBeNull();

    const a = await mount();
    a.session.actions.resume();
    await advance(10);
    otherTabEvent();
    await advance(10);

    expect(offerOf(b)).toBeNull();
  });
});

describe('a session that holds the lock of its input', () => {
  it('holds the lock of the lineage it writes, until it is disposed', async () => {
    const h = await mount();
    track(h, snapshotOf([['name', 'A']]), true);
    await advance(10);
    expect(fake.held.size).toBe(1);

    h.dispose();
    await advance(10);
    expect(fake.held.size).toBe(0);
  });
});

describe('the identity of the scope', () => {
  it('keys the scope on user and organization', () => {
    expect(IDENTITY).toEqual({ userId: 'user_1', organizationId: 'org_1' });
  });
});
