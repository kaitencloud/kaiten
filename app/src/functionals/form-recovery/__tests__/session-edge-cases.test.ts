import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { markSent } from '@/lib/form-recovery';
import {
  isoAfter,
  makeEntry,
  NOW,
} from '@/lib/form-recovery/__tests__/test-records';
import { defineFormRecovery } from '../define-form-recovery';
import { encodePayload } from '@/lib/form-recovery';
import { selectOffer } from '../logic/selectors';
import { useFakeLocks } from './fake-locks';
import {
  IDENTITY,
  mountSession,
  seedEntry,
  snapshotOf,
  storedRecords,
  thingRecovery,
  track,
  type Harness,
} from './session-helpers';

useFakeLocks();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const info = { version: 1, steps: ['identity', 'details'] };
const offerOf = (h: Harness) => selectOffer(h.state(), info);

function entry(overrides: Parameters<typeof makeEntry>[0] = {}) {
  return makeEntry({
    formId: 'things.create',
    payload: encodePayload([['name', 'Gold']]),
    ...overrides,
  });
}

describe('a tab that comes back from the back-forward cache', () => {
  it('does not resume an input another tab sent while it was away', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const b = mountSession();
    await advance(0);
    expect(offerOf(b)).not.toBeNull();

    // Tab A resumed and sent it; tab B was frozen and missed every storage event.
    markSent({
      scope: { ...IDENTITY, formId: 'things.create', context: '', lineageId: 'old' },
      at: new Date(),
      created: null,
      followUp: false,
    });
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await advance(10);

    expect(offerOf(b)).toBeNull();
    b.session.actions.resume();
    await advance(10);
    expect(b.state().restored).toBeNull();
  });

  it('looks again, too, when the page becomes visible', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const b = mountSession();
    await advance(0);
    markSent({
      scope: { ...IDENTITY, formId: 'things.create', context: '', lineageId: 'old' },
      at: new Date(),
      created: null,
      followUp: false,
    });

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(10);

    expect(offerOf(b)).toBeNull();
  });

  it('is not made to look again by a page shown from the network', async () => {
    const h = mountSession();
    await advance(0);
    const spy = vi.spyOn(Storage.prototype, 'getItem');

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    await advance(10);

    expect(spy).not.toHaveBeenCalled();
    expect(h.state().writer.status).toBe('idle');
  });
});

describe('a subtree that was replaced', () => {
  it('has its late reports ignored, so it cannot undo the restore that replaced it', async () => {
    seedEntry(entry({ lineageId: 'old', stepId: 'identity' }));
    const h = mountSession();
    await advance(0);
    const staleEpoch = h.session.actions.getEpoch();

    h.session.actions.resume();
    await advance(10);
    expect(h.session.actions.getEpoch()).toBeGreaterThan(staleEpoch);

    // The blank form that was replaced reports a blank snapshot, and flushes.
    h.session.actions.track(snapshotOf([]), true, staleEpoch);
    h.session.actions.flushOnUnmount(staleEpoch);
    await advance(2_000);

    expect(storedRecords().old).toMatchObject({ kind: 'entry' });
    expect(h.state().writer).toEqual({ status: 'saved' });
  });
});

describe('React StrictMode, which starts, stops and starts a mount again', () => {
  it('survives a start, a dispose and a start, with one offer and nothing written', async () => {
    seedEntry(entry({ lineageId: 'old' }));
    const h = mountSession();
    await advance(0);
    const stored = window.localStorage.getItem('kaiten:form-recovery');

    h.session.dispose();
    h.session.start();
    await advance(10);

    expect(offerOf(h)).toMatchObject({ kind: 'resumable' });
    expect(window.localStorage.getItem('kaiten:form-recovery')).toBe(stored);
  });

  it('can hold its lock again after being stopped and started', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'A']]), true);
    await advance(10);
    h.session.dispose();
    h.session.start();

    track(h, snapshotOf([['name', 'Ab']]), true);
    await advance(200);

    expect(h.state().writer.status).toBe('saved');
  });
});

describe('what the storage holds', () => {
  it('survives a blob that is not JSON: no offer, and the next write repairs the key', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.setItem('kaiten:form-recovery', '{not json');

    const h = mountSession();
    await advance(0);
    expect(offerOf(h)).toBeNull();

    track(h, snapshotOf([['name', 'Gold']]), true);
    await advance(10);
    expect(Object.values(storedRecords())).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem('kaiten:form-recovery')!)).toBeTypeOf('object');
  });

  it('keeps an entry for 7 days from its last write, and pushes the expiry with each write', async () => {
    const h = mountSession();
    await advance(0);
    track(h, snapshotOf([['name', 'A']]), true);
    const [first] = Object.values(storedRecords());
    expect(first!.expiresAt).toBe(isoAfter(NOW, 7 * 24 * 3_600_000));

    await advance(3 * 24 * 3_600_000);
    track(h, snapshotOf([['name', 'Ab']]), true);
    const [second] = Object.values(storedRecords());
    expect(second!.expiresAt).toBe(isoAfter(NOW, 10 * 24 * 3_600_000));
    expect(second!.createdAt).toBe(first!.createdAt);
  });

  it('keeps an entry as long as its form says', async () => {
    const short = defineFormRecovery<{ name: string; count: number; note: string; secret: string }>({
      ...thingRecovery,
      retentionDays: 1,
    });
    const h = mountSession({ descriptor: short });
    await advance(0);

    track(h, snapshotOf([['name', 'A']]), true);

    expect(Object.values(storedRecords())[0]!.expiresAt).toBe(isoAfter(NOW, 24 * 3_600_000));
  });

  it('does not offer an input after its 7 days, and removes it', async () => {
    const h1 = mountSession();
    await advance(0);
    track(h1, snapshotOf([['name', 'A']]), true);
    h1.session.actions.flushOnUnmount(h1.session.actions.getEpoch());
    h1.dispose();

    await advance(7 * 24 * 3_600_000 + 1_000);
    const h2 = mountSession();
    await advance(10);

    expect(offerOf(h2)).toBeNull();
    expect(storedRecords()).toEqual({});
  });
});
