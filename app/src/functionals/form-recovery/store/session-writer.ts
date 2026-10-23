import {
  buildRecordKey,
  evictOldestEntry,
  holdLineage,
  liveLineages,
  pruneRecords,
  readFormRecoveryRecord,
  removeRecord,
  replaceRecord,
  type FormRecoveryEntry,
  type SaveHandle,
  type SaveRefusal,
} from '@/lib/form-recovery';
import { logger } from '@/lib/logger';
import { buildEntry, snapshotSignature } from '../logic/entry';
import type { FormRecoverySnapshot, FormRecoveryWriterState } from '../types';
import type { SessionContext } from './session-context';

/** A session in one of these does not write what the person types. */
const NON_WRITING = new Set<FormRecoveryWriterState['status']>([
  'reading',
  'disabled',
  'discarded',
  'sentElsewhere',
  'submitting',
  'submitted',
  'paused',
]);

/** After this many more changes, the reduced offer goes away. */
const CONDENSED_CHANGES = 3;
const HOLD_RETRY_MS = 50;

export function newLineageId(): string {
  return crypto.randomUUID();
}

export function ownRecordKey(ctx: SessionContext): string {
  return buildRecordKey(ctx.runtime.scopeKey, ctx.store.state.lineageId);
}

export function setWriter(
  ctx: SessionContext,
  writer: FormRecoveryWriterState,
) {
  ctx.setState({ writer });
}

export function releaseHold(ctx: SessionContext) {
  ctx.runtime.ownHold?.release();
  ctx.runtime.ownHold = null;
}

/**
 * Holds the lock of this lineage, so that no other tab offers it. A lock this
 * very tab released a moment ago can still look taken: try once more.
 */
export function ensureHold(ctx: SessionContext): Promise<void> {
  const { runtime } = ctx;
  if (!runtime.alive || runtime.ownHold) return Promise.resolve();

  // One attempt at a time: two would take the lock from each other.
  runtime.holding ??= takeHold(ctx).finally(() => {
    runtime.holding = null;
  });
  return runtime.holding;
}

async function takeHold(ctx: SessionContext): Promise<void> {
  const { runtime } = ctx;
  const key = ownRecordKey(ctx);

  let hold = await holdLineage(key);
  if (hold.status === 'taken') {
    await new Promise((resolve) => setTimeout(resolve, HOLD_RETRY_MS));
    hold = await holdLineage(key);
  }

  if (hold.status === 'held') {
    if (!runtime.alive || ownRecordKey(ctx) !== key || runtime.ownHold) {
      hold.release();
      return;
    }
    runtime.ownHold = hold;
    return;
  }
  if (hold.status === 'taken') {
    const { writer } = ctx.store.state;
    if (writer.status === 'dirty' || writer.status === 'saved') {
      setWriter(ctx, { status: 'paused', reason: 'otherTab' });
    }
  }
}

export function startNewLineage(ctx: SessionContext) {
  releaseHold(ctx);
  const { runtime } = ctx;
  runtime.createdAt = null;
  runtime.lastWritten = null;
  runtime.ownRecordExpected = false;
  runtime.attempt = 0;
  runtime.attemptedAt = null;
  ctx.setState({ lineageId: newLineageId() });
}

/** What a refused write says about this lineage. */
export function onRefused(ctx: SessionContext, reason: SaveRefusal) {
  const { runtime } = ctx;

  switch (reason) {
    case 'tombstoned': {
      const record = readFormRecoveryRecord(ownRecordKey(ctx));
      if (record?.kind !== 'tombstone') return;
      if (record.reason === 'sent') {
        setWriter(ctx, { status: 'sentElsewhere' });
      } else if (record.reason === 'discarded') {
        setWriter(ctx, { status: 'paused', reason: 'discarded' });
      } else {
        // Evicted while alive: the eviction should not have chosen it.
        startNewLineage(ctx);
        writeSnapshot(ctx, { status: 'editing', force: true });
      }
      return;
    }
    case 'signed-out':
    case 'disabled':
      setWriter(ctx, { status: 'disabled' });
      return;
    case 'too-large':
      runtime.ownRecordExpected = false;
      runtime.lastWritten = null;
      return;
    default:
      return;
  }
}

/** The storage could not take the write: make room once, else give up quietly. */
async function recoverFromFailure(
  ctx: SessionContext,
  entry: FormRecoveryEntry,
): Promise<void> {
  const { runtime } = ctx;
  const keep = new Set([...runtime.live, entry.key]);

  if (await evictOldestEntry(ctx.now(), keep)) {
    const retry = replaceRecord(entry, { mountedAt: runtime.mountedAt });
    if (retry.written && (await retry.persisted).ok) return;
  }

  void removeRecord(entry.key);
  runtime.ownRecordExpected = false;
  runtime.lastWritten = null;
  if (
    entry.status === 'editing' &&
    ctx.store.state.writer.status !== 'discarded'
  ) {
    setWriter(ctx, { status: 'paused', reason: 'quota' });
  }
  if (!runtime.warnedQuota) {
    runtime.warnedQuota = true;
    logger.warn('The storage is full: the unsent input is no longer kept', {
      formId: entry.formId,
    });
  }
}

/**
 * The limits (lineages per form, records in all) are also kept while the page
 * lives: a tab that starts over again and again would otherwise pile up
 * lineages until the storage is full. Run when a lineage is created, and never
 * on one a tab holds, this one included.
 */
async function enforceLimits(ctx: SessionContext): Promise<void> {
  const live = await liveLineages();
  if (!ctx.runtime.alive) return;
  await pruneRecords(ctx.now(), null, new Set([...live, ownRecordKey(ctx)]));
}

type WriteOptions = {
  status: FormRecoveryEntry['status'];
  /** Write even if nothing changed since the last write. */
  force?: boolean;
  attempt?: number;
  attemptedAt?: string | null;
};

/**
 * Writes the last snapshot as the entry of this lineage. The write itself is
 * synchronous, which is what a flush on `pagehide` needs; its verdict is
 * handled when it comes.
 */
export function writeSnapshot(
  ctx: SessionContext,
  options: WriteOptions,
): SaveHandle | null {
  const { runtime, config } = ctx;
  if (!runtime.snapshot) return null;

  // The never-kept fields still to enter stay in the record until they are.
  const snapshot = {
    ...runtime.snapshot,
    omittedFilled: [
      ...new Set([
        ...runtime.snapshot.omittedFilled,
        ...ctx.store.state.omittedReminder,
      ]),
    ],
  };
  const signature = snapshotSignature(snapshot);
  if (
    !options.force &&
    options.status === 'editing' &&
    runtime.ownRecordExpected &&
    signature === runtime.lastWritten
  ) {
    return null;
  }

  const now = ctx.now();
  const entry = buildEntry({
    scope: runtime.scope,
    lineageId: ctx.store.state.lineageId,
    sessionId: runtime.sessionId,
    formVersion: config.descriptor.version,
    retentionDays: config.descriptor.retentionDays,
    snapshot,
    status: options.status,
    attempt: options.attempt ?? runtime.attempt,
    attemptedAt:
      options.attemptedAt === undefined
        ? runtime.attemptedAt
        : options.attemptedAt,
    createdAt: runtime.createdAt,
    now,
  });

  const handle = replaceRecord(entry, { mountedAt: runtime.mountedAt });
  if (!handle.written) {
    if (options.status === 'editing') onRefused(ctx, handle.reason);
    return handle;
  }

  const createsLineage = !runtime.ownRecordExpected;
  runtime.createdAt = entry.createdAt;
  runtime.ownRecordExpected = true;
  runtime.lastSeenAt = now.getTime();
  if (options.status === 'editing') runtime.lastWritten = signature;
  void ensureHold(ctx);
  if (createsLineage) void enforceLimits(ctx);
  void handle.persisted.then((result) => {
    if (!result.ok) void recoverFromFailure(ctx, entry);
  });

  const { writer } = ctx.store.state;
  if (writer.status === 'idle' || writer.status === 'dirty') {
    setWriter(ctx, { status: 'saved' });
  }
  return handle;
}

/** The form is back to its initial values: nothing is worth keeping. */
export function removeOwn(ctx: SessionContext) {
  const { runtime } = ctx;
  if (runtime.ownRecordExpected) {
    void removeRecord(ownRecordKey(ctx));
  }
  runtime.ownRecordExpected = false;
  runtime.lastWritten = null;
  releaseHold(ctx);
}

/** Called by the debounce, and by every immediate flush. */
export function writeNow(ctx: SessionContext) {
  const { status } = ctx.store.state.writer;
  if (status !== 'dirty' && status !== 'saved') return;
  writeSnapshot(ctx, { status: 'editing' });
}

/**
 * The adapter reports the state of the form. Nothing is written unless it
 * counts, and what does not count any more removes what was written.
 */
export function trackSnapshot(
  ctx: SessionContext,
  snapshot: FormRecoverySnapshot,
  immediate: boolean,
) {
  const { runtime, store } = ctx;
  runtime.snapshot = snapshot;
  const { writer } = store.state;
  if (NON_WRITING.has(writer.status)) return;

  if (!snapshot.counts) {
    ctx.cancelWrite();
    removeOwn(ctx);
    runtime.lastTracked = null;
    if (writer.status !== 'idle') setWriter(ctx, { status: 'idle' });
    return;
  }

  const signature = snapshotSignature(snapshot);
  const changed = signature !== runtime.lastTracked;
  runtime.lastTracked = signature;

  if (writer.status === 'idle') {
    setWriter(ctx, { status: 'dirty' });
    // The offer shrinks to a line once something is typed under it.
    if (
      store.state.offerMode === 'offering' &&
      store.state.candidates.length > 0
    ) {
      ctx.setState({ offerMode: 'condensed', condensedChanges: 0 });
    }
  } else if (changed && store.state.offerMode === 'condensed') {
    const condensedChanges = store.state.condensedChanges + 1;
    ctx.setState(
      condensedChanges > CONDENSED_CHANGES
        ? { offerMode: 'hidden', condensedChanges }
        : { condensedChanges },
    );
  }

  if (!changed && !immediate) return;
  ctx.scheduleWrite();
  if (immediate) writeNow(ctx);
}

/** The adapter leaves: write what is pending, unless this mount no longer owns it. */
export function flushOnUnmount(ctx: SessionContext, epoch: number) {
  if (epoch !== ctx.runtime.epoch) return;
  ctx.cancelWrite();
  writeNow(ctx);
}
