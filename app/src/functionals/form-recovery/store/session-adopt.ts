import {
  decodePayload,
  FORM_RECOVERY_DEFAULT_RETENTION_DAYS,
  holdLineage,
  readFormRecoveryRecord,
  readScope,
  removeRecord,
  replaceRecord,
  type FormRecoveryEntry,
} from '@/lib/form-recovery';
import { logger } from '@/lib/logger';
import { resolveArrival } from '../logic/arrival';
import { entryToSnapshot, snapshotSignature } from '../logic/entry';
import type { PatchEntry } from '../logic/patch';
import { restoreValues } from '../logic/restore';
import { currentCandidate } from '../logic/selectors';
import type { FormRecoveryRestored } from '../types';
import type { SessionContext } from './session-context';
import { refresh } from './session-scope';
import { releaseHold } from './session-writer';

function isPatch(value: unknown): value is PatchEntry[] {
  return (
    Array.isArray(value) &&
    value.every((item) => Array.isArray(item) && typeof item[0] === 'string')
  );
}

function decodeExtra(ctx: SessionContext, entry: FormRecoveryEntry): unknown {
  if (entry.extra === null) return undefined;

  try {
    const decoded = decodePayload(entry.extra);
    const schema = ctx.config.descriptor.extraSchema;
    if (!schema) return decoded;
    const parsed = schema.safeParse(decoded);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function restoreEntry(
  ctx: SessionContext,
  entry: FormRecoveryEntry,
): {
  restored: FormRecoveryRestored<any, any>;
  notes: ReturnType<typeof restoreValues>['notes'];
} | null {
  const { descriptor, pristine, steps } = ctx.config;

  let patch: unknown;
  try {
    patch = decodePayload(entry.payload);
  } catch {
    patch = null;
  }
  if (!isPatch(patch)) return null;

  const outcome = restoreValues(patch, {
    pristine,
    schema: descriptor.schema,
    omit: descriptor.omit,
    fieldLabels: descriptor.fieldLabels,
  });
  const arrival = resolveArrival({
    steps,
    stored: {
      stepId: entry.stepId,
      furthestStepId: entry.furthestStepId,
      stepIds: entry.stepIds,
    },
    stepFields: descriptor.stepFields,
    problemKeys: [
      ...outcome.resetKeys,
      ...outcome.removedKeys,
      ...outcome.invalidKeys,
    ],
    omittedFilled: entry.omittedFilled,
  });

  const extra = decodeExtra(ctx, entry);
  return {
    restored: {
      values: outcome.values,
      ...arrival,
      ...(extra === undefined ? {} : { extra, extraSource: entry.extraSource }),
    },
    notes: outcome.notes,
  };
}

type Restoration = NonNullable<ReturnType<typeof restoreEntry>>;

/** Makes the entry this mount's own in memory: no storage is touched. */
function takeOver(
  ctx: SessionContext,
  record: FormRecoveryEntry,
  result: Restoration,
  hold: { release: () => void } | null,
) {
  const { runtime, store } = ctx;

  releaseHold(ctx);
  runtime.ownHold = hold;
  runtime.epoch += 1;
  runtime.snapshot = entryToSnapshot(record);
  runtime.lastWritten = snapshotSignature(runtime.snapshot);
  runtime.lastTracked = runtime.lastWritten;
  runtime.createdAt = record.createdAt;
  runtime.attempt = record.attempt;
  runtime.attemptedAt = null;
  runtime.ownRecordExpected = true;
  runtime.lastSeenAt = ctx.now().getTime();

  ctx.setState({
    lineageId: record.lineageId,
    generation: store.state.generation + 1,
    restored: result.restored,
    notes: result.notes,
    omittedReminder: record.omittedFilled,
    writer: { status: 'saved' },
    offerMode: 'offering',
    condensedChanges: 0,
    unknownOutcome: false,
    followUpPending: false,
    focusToken: store.state.focusToken + 1,
  });
}

/**
 * Adopting an input writes it once: the other tabs learn of it through the
 * change (a lock alone sends no event), the session id says who owns it when
 * there are no Web Locks, and a send left without a verdict is taken
 * knowingly, so that its warning does not come back at every visit. The write
 * is the last check: it is refused when the lineage was sent or discarded
 * since the record was read.
 */
function writeAdoption(ctx: SessionContext, record: FormRecoveryEntry) {
  const { runtime } = ctx;
  const now = ctx.now();
  const retentionDays =
    ctx.config.descriptor.retentionDays ?? FORM_RECOVERY_DEFAULT_RETENTION_DAYS;

  return replaceRecord(
    {
      ...record,
      sessionId: runtime.sessionId,
      status: 'editing',
      attemptedAt: null,
      updatedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + retentionDays * 86_400_000,
      ).toISOString(),
    },
    { mountedAt: runtime.mountedAt },
  );
}

/**
 * Makes an entry this mount's own, once its lock is taken (or there is none to
 * take): restores it on the initial values of today and replaces the subtree of
 * the form. False when it cannot be read back, or when the lineage was ended
 * since the entry was read; nothing is adopted then.
 */
export function applyAdoption(
  ctx: SessionContext,
  record: FormRecoveryEntry,
  hold: { release: () => void } | null,
): boolean {
  const result = restoreEntry(ctx, record);
  if (!result) {
    hold?.release();
    void removeRecord(record.key);
    logger.warn('An unsent input could not be read back', {
      formId: record.formId,
    });
    return false;
  }

  if (!writeAdoption(ctx, record).written) {
    hold?.release();
    return false;
  }

  takeOver(ctx, record, result, hold);
  return true;
}

/**
 * The entry an "Undo" of a cancelled form brought back, restored at creation
 * with a pure read: the write, and the lock, wait for `commitPendingAdoption`,
 * since a creation may run twice or never be committed.
 */
export function previewPendingUndo(ctx: SessionContext, lineageId: string) {
  const entry = readScope(ctx.runtime.scope, ctx.now(), {
    prune: false,
  }).entries.find((item) => item.lineageId === lineageId);
  const result = entry ? restoreEntry(ctx, entry) : null;
  if (!entry || !result) return;

  takeOver(ctx, entry, result, null);
  ctx.runtime.pendingAdoption = entry;
}

/** Writes the entry `previewPendingUndo` restored, once the mount started. */
export function commitPendingAdoption(ctx: SessionContext) {
  const { runtime } = ctx;
  const record = runtime.pendingAdoption;
  if (!record) return;
  runtime.pendingAdoption = null;

  const handle = writeAdoption(ctx, record);
  if (handle.written) return;

  // Ended in the meantime: the form keeps what it shows, the entry is gone.
  runtime.ownRecordExpected = false;
  runtime.lastWritten = null;
  if (handle.reason === 'tombstoned') {
    ctx.setState({ writer: { status: 'paused', reason: 'discarded' } });
  } else if (handle.reason === 'signed-out') {
    ctx.setState({ writer: { status: 'disabled' } });
  } else {
    ctx.setState({ writer: { status: 'idle' } });
  }
}

/**
 * Checks the entry is still there and that no other tab got it first, then
 * adopts it. False when it is gone, taken, or cannot be read.
 */
export async function adoptEntry(
  ctx: SessionContext,
  key: string,
): Promise<boolean> {
  const { store } = ctx;

  const record = readFormRecoveryRecord(key);
  if (record?.kind !== 'entry' || new Date(record.expiresAt) <= ctx.now()) {
    await refresh(ctx);
    return false;
  }

  const hold = await holdLineage(key);
  if (hold.status === 'taken') {
    ctx.setState({
      skipped: [...store.state.skipped, key],
      openElsewhere: true,
    });
    await refresh(ctx);
    return false;
  }

  const holding = hold.status === 'held' ? hold : null;

  // The lock is taken: another tab may have sent or discarded the lineage while
  // it was awaited, so the record is read once more.
  const current = readFormRecoveryRecord(key);
  if (current?.kind !== 'entry' || new Date(current.expiresAt) <= ctx.now()) {
    holding?.release();
    await refresh(ctx);
    return false;
  }

  const adopted = applyAdoption(ctx, current, holding);
  await refresh(ctx);
  return adopted;
}

/** "Resume": adopts the entry on offer. */
export async function resume(ctx: SessionContext): Promise<void> {
  const candidate = currentCandidate(ctx.store.state);
  if (candidate) await adoptEntry(ctx, candidate.key);
}
