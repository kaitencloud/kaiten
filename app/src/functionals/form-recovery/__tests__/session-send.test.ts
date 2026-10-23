import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  FORM_RECOVERY_STORAGE_KEY,
  getFormRecoveryRuntime,
  readScope,
  type FormRecoveryScope,
} from '@/lib/form-recovery';
import { ApiError } from '@/lib/errors';
import { makeEntry } from '@/lib/form-recovery/__tests__/test-records';
import { selectOffer } from '../logic/selectors';
import {
  IDENTITY,
  mountSession,
  seedEntry,
  snapshotOf,
  storedRecords,
  track,
} from './session-helpers';

const SCOPE: FormRecoveryScope = {
  ...IDENTITY,
  formId: 'things.create',
  context: '',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-23T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const api = (status?: number) => new ApiError({ status, data: null });

function offerOf(h: ReturnType<typeof mountSession>) {
  return selectOffer(h.state(), {
    version: 1,
    steps: ['identity', 'details'],
    stepFields: { identity: ['name'], details: ['count', 'note'] },
  });
}

async function typed(name = 'Gold') {
  const h = mountSession();
  await advance(0);
  track(h, snapshotOf([['name', name]]), true);
  return h;
}

describe('send', () => {
  it('writes the entry as submitting before the request goes out', async () => {
    const h = await typed();
    let seen: Record<string, any> | undefined;

    await h.session.actions.send(async () => {
      seen = Object.values(storedRecords())[0];
      return 'ok';
    });

    expect(seen).toMatchObject({ kind: 'entry', status: 'submitting' });
    expect(typeof seen!.attemptedAt).toBe('string');
    expect(h.state().writer).toEqual({ status: 'submitted' });
  });

  it('replaces the entry by a tombstone with no values when the server accepts, before it returns', async () => {
    const h = await typed();

    const result = await h.session.actions.send(() => Promise.resolve({ slug: 'gold' }), {
      created: (created) => ({ id: created.slug, label: 'Gold' }),
    });

    expect(result).toEqual({ slug: 'gold' });
    const [record] = Object.values(storedRecords());
    expect(record).toMatchObject({
      kind: 'tombstone',
      reason: 'sent',
      created: { id: 'gold', label: 'Gold' },
      followUp: false,
    });
    for (const gone of ['payload', 'attemptedAt', 'labels', 'extra', 'status']) {
      expect(record).not.toHaveProperty(gone);
    }
  });

  it('never offers a sent form again, not here after a remount, not in another tab', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.resolve(1));
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    h.dispose();

    const again = mountSession();
    await advance(0);
    expect(offerOf(again)).toBeNull();
    expect(again.state().candidates).toEqual([]);
    expect(readScope(SCOPE).entries).toEqual([]);
  });

  it('is not undone by the unmount that follows a success', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.resolve(1));

    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    h.dispose();
    await advance(5_000);

    expect(Object.values(storedRecords()).map((record) => record.kind)).toEqual(['tombstone']);
  });

  it('writes the tombstone even when the page is gone before the answer', async () => {
    const h = await typed();
    let answer!: (value: string) => void;
    const request = new Promise<string>((resolve) => {
      answer = resolve;
    });

    const sending = h.session.actions.send(() => request);
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    h.dispose();
    expect(Object.values(storedRecords())[0]!.status).toBe('submitting');

    answer('done');
    await sending;

    expect(Object.values(storedRecords())[0]).toMatchObject({ kind: 'tombstone', reason: 'sent' });
  });

  it('writes the tombstone from a paused tab, too', async () => {
    const h = await typed();
    const [entry] = Object.values(storedRecords());
    // Another tab discarded this lineage: this one is paused.
    const { discardRecord } = await import('@/lib/form-recovery');
    discardRecord(entry!.key, 'discarded');
    window.dispatchEvent(new StorageEvent('storage', { key: FORM_RECOVERY_STORAGE_KEY, storageArea: window.localStorage }));
    await advance(10);
    expect(h.state().writer.status).toBe('paused');

    await h.session.actions.send(() => Promise.resolve(1));

    expect(Object.values(storedRecords())[0]).toMatchObject({ kind: 'tombstone', reason: 'sent' });
  });

  it('still writes the tombstone when created() throws, and does not fail', async () => {
    const h = await typed();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      h.session.actions.send(() => Promise.resolve({}), {
        created: () => {
          throw new Error('no slug');
        },
      }),
    ).resolves.toEqual({});

    expect(Object.values(storedRecords())[0]).toMatchObject({
      kind: 'tombstone',
      reason: 'sent',
      created: null,
    });
  });

  it('keeps the tombstone when the storage is full: evicts, then retries', async () => {
    seedEntry(makeEntry({ lineageId: 'stale', formId: 'other.create' }));
    const h = await typed();
    const real = Storage.prototype.setItem;
    let failures = 1;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === FORM_RECOVERY_STORAGE_KEY && failures > 0) {
        failures -= 1;
        throw new DOMException('full', 'QuotaExceededError');
      }
      return real.call(this, key, value);
    });

    await h.session.actions.send(() => Promise.resolve(1));

    const records = Object.values(storedRecords());
    expect(records.find((record) => record.reason === 'sent')).toBeDefined();
    expect(records.some((record) => record.kind === 'entry' && record.status === 'submitting')).toBe(false);
  });

  it('removes the entry as a last resort when not even a tombstone fits', async () => {
    const h = await typed();
    getFormRecoveryRuntime();
    // The entry is on disk. From now on nothing can be written but a removal.
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (value.includes('"tombstone"')) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, key, value);
    });

    await h.session.actions.send(() => Promise.resolve(1));

    expect(Object.values(storedRecords()).filter((record) => record.kind === 'entry')).toEqual([]);
  });

  it('is a pass-through when disabled, submitted or sent elsewhere', async () => {
    const disabled = mountSession({ enabled: false });
    const request = vi.fn().mockResolvedValue('ok');

    await expect(disabled.session.actions.send(request)).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(1);

    const h = await typed();
    await h.session.actions.send(() => Promise.resolve(1));
    const before = window.localStorage.getItem(FORM_RECOVERY_STORAGE_KEY);

    // A retry of a chain: must not write `submitting` over the tombstone.
    await h.session.actions.send(() => Promise.resolve(2));
    expect(window.localStorage.getItem(FORM_RECOVERY_STORAGE_KEY)).toBe(before);
    expect(h.state().writer).toEqual({ status: 'submitted' });
  });

  it('works for a form that never counted: no entry, a tombstone all the same', async () => {
    const h = mountSession();
    await advance(0);

    await h.session.actions.send(() => Promise.resolve(1));

    expect(Object.values(storedRecords())[0]).toMatchObject({ kind: 'tombstone', reason: 'sent' });
  });

  it('starts a new input after a sent one with an ordinary offer, never an uncertain one', async () => {
    const first = await typed('A');
    await first.session.actions.send(() => Promise.resolve(1));
    first.session.actions.restart();
    await advance(0);
    expect(first.state().writer).toEqual({ status: 'idle' });

    track(first, snapshotOf([['name', 'B']]), true);
    first.session.actions.flushOnUnmount(first.session.actions.getEpoch());
    first.dispose();

    const again = mountSession();
    await advance(0);
    expect(offerOf(again)).toMatchObject({ kind: 'resumable' });
  });
});

describe('send, refused', () => {
  it.each([400, 401, 409, 422, 429])('a %i brings it back to editing with one more attempt, and rethrows', async (status) => {
    const h = await typed();
    const error = api(status);

    await expect(h.session.actions.send(() => Promise.reject(error))).rejects.toBe(error);

    const [record] = Object.values(storedRecords());
    expect(record).toMatchObject({ kind: 'entry', status: 'editing', attempt: 1, attemptedAt: null });
    expect(h.state().writer).toEqual({ status: 'saved' });
    expect(h.state().unknownOutcome).toBe(false);
  });

  it('keeps the entry on offer for the next visit, as an ordinary resume', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.reject(api(422))).catch(() => {});
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    h.dispose();

    const again = mountSession();
    await advance(0);

    expect(offerOf(again)).toMatchObject({ kind: 'resumable' });
  });

  it('keeps the attemptedAt of an earlier unknown outcome: a refusal today proves nothing about yesterday', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.reject(api(503))).catch(() => {});
    const attemptedAt = Object.values(storedRecords())[0]!.attemptedAt as string;
    expect(attemptedAt).toBeTruthy();

    await advance(60_000);
    await h.session.actions.send(() => Promise.reject(api(422))).catch(() => {});

    expect(Object.values(storedRecords())[0]).toMatchObject({ attempt: 1, attemptedAt });
  });
});

describe('send, unknown outcome', () => {
  it.each([[500], [503], [408], [undefined]])('a %s keeps the attemptedAt and warns', async (status) => {
    const h = await typed();

    await expect(h.session.actions.send(() => Promise.reject(api(status)))).rejects.toBeInstanceOf(ApiError);

    const [record] = Object.values(storedRecords());
    expect(record).toMatchObject({ kind: 'entry', status: 'editing', attempt: 0 });
    expect(record!.attemptedAt).toEqual(expect.any(String));
    expect(h.state().unknownOutcome).toBe(true);
    expect(h.state().writer).toEqual({ status: 'saved' });
  });

  it('treats an error that is not an API error as unknown', async () => {
    const h = await typed();

    await expect(h.session.actions.send(() => Promise.reject(new TypeError('Failed to fetch')))).rejects.toThrow('Failed to fetch');

    expect(h.state().unknownOutcome).toBe(true);
  });

  it('offers it as "may have gone through" on the next visit, and the warning goes once acknowledged', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.reject(api(503))).catch(() => {});
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    h.dispose();

    const again = mountSession();
    await advance(0);
    expect(offerOf(again)).toMatchObject({ kind: 'uncertain' });

    again.session.actions.resume();
    await advance(10);
    expect(Object.values(storedRecords())[0]!.attemptedAt).toBeNull();
    again.session.actions.flushOnUnmount(again.session.actions.getEpoch());
    again.dispose();

    const third = mountSession();
    await advance(0);
    expect(offerOf(third)).toMatchObject({ kind: 'resumable' });
  });

  it('leaves a submitting entry when the page dies during the request: offered with the warning', async () => {
    const h = await typed();
    void h.session.actions.send(() => new Promise(() => {}));
    h.dispose();

    const again = mountSession();
    await advance(0);

    expect(offerOf(again)).toMatchObject({ kind: 'uncertain' });
  });

  it('clears the warning at the next verdict', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.reject(api(503))).catch(() => {});
    expect(h.state().unknownOutcome).toBe(true);

    await h.session.actions.send(() => Promise.resolve(1));

    expect(h.state().unknownOutcome).toBe(false);
  });
});

describe('begin, for a send made of several requests', () => {
  it('settles as accepted when the first irreversible request does', async () => {
    const h = await typed();
    const attempt = h.session.actions.begin();

    await attempt.accepted({ id: 'release-1' });

    expect(Object.values(storedRecords())[0]).toMatchObject({ kind: 'tombstone', reason: 'sent' });
    expect(h.state().writer).toEqual({ status: 'submitted' });
  });

  it('settles as failed with the classification of the error', async () => {
    const h = await typed();
    const attempt = h.session.actions.begin();

    attempt.failed(api(422));

    expect(Object.values(storedRecords())[0]).toMatchObject({ status: 'editing', attempt: 1 });
  });
});

describe('a chain left unfinished', () => {
  it('says so on the next visit, names the created object, and is seen once', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.resolve({ id: 'voucher-1' }), {
      created: (voucher) => ({ id: voucher.id, label: 'Black Friday' }),
      followUp: true,
    });
    expect(h.state().followUpPending).toBe(true);
    h.dispose();

    const again = mountSession();
    await advance(0);
    expect(again.state().followUp).toMatchObject({ created: { id: 'voucher-1', label: 'Black Friday' } });
    expect(offerOf(again)).toBeNull();

    again.session.actions.dismiss('followUp');
    expect(again.state().followUp).toBeNull();
    again.dispose();

    const third = mountSession();
    await advance(0);
    expect(third.state().followUp).toBeNull();
  });

  it('is settled by complete()', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.resolve({ id: 'voucher-1' }), {
      created: (voucher) => ({ id: voucher.id }),
      followUp: true,
    });

    h.session.actions.complete();
    h.dispose();

    expect(h.state().followUpPending).toBe(false);
    const again = mountSession();
    await advance(0);
    expect(again.state().followUp).toBeNull();
  });
});

describe('discard', () => {
  it('replaces the entry by a tombstone, locks the session, and asks nothing for an "Abandon"', async () => {
    const h = await typed();

    h.session.actions.discard();

    expect(Object.values(storedRecords())[0]).toMatchObject({ kind: 'tombstone', reason: 'discarded' });
    expect(h.state().writer).toEqual({ status: 'discarded' });
    expect(h.notify).not.toHaveBeenCalled();

    track(h, snapshotOf([['name', 'Golden']]), true);
    h.session.actions.flushOnUnmount(h.session.actions.getEpoch());
    expect(Object.values(storedRecords())[0]!.kind).toBe('tombstone');
  });

  it('offers an undo that writes the entry again and takes the person back to the form', async () => {
    const h = await typed();
    const undo = vi.fn();

    h.session.actions.discard({ undo });
    expect(h.notify).toHaveBeenCalledWith('cancelled', expect.any(Function));
    h.dispose();

    const bringBack = h.notify.mock.calls[0]![1] as () => void;
    bringBack();
    expect(undo).toHaveBeenCalledTimes(1);

    // The next form of the scope restores it directly, with no offer.
    const next = mountSession();
    await advance(0);
    expect(next.state().restored?.values).toMatchObject({ name: 'Gold' });
    expect(next.state().writer).toEqual({ status: 'saved' });
    expect(offerOf(next)).toBeNull();
  });

  it('says nothing when nothing was stored', async () => {
    const h = mountSession();
    await advance(0);

    h.session.actions.discard({ undo: vi.fn() });

    expect(h.notify).not.toHaveBeenCalled();
    expect(h.state().writer).toEqual({ status: 'discarded' });
  });

  it('is not brought back by a flush', async () => {
    const h = await typed();
    h.session.actions.discard();

    track(h, snapshotOf([['name', 'Golden']]), false);
    await advance(5_000);

    expect(Object.values(storedRecords()).map((record) => record.kind)).toEqual(['tombstone']);
  });
});

describe('restart', () => {
  it('begins a new lineage on a fresh subtree', async () => {
    const h = await typed();
    await h.session.actions.send(() => Promise.resolve(1));
    const { generation, lineageId } = h.state();

    h.session.actions.restart();

    expect(h.state().generation).toBe(generation + 1);
    expect(h.state().lineageId).not.toBe(lineageId);
    expect(h.state().writer).toEqual({ status: 'idle' });
    expect(h.state().restored).toBeNull();
  });
});
