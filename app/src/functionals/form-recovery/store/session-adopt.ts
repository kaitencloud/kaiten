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

/**
 * Makes an entry this mount's own, once its lock is taken (or there is none to
 * take): restores it on the initial values of today and replaces the subtree of
 * the form. False when it cannot be read back.
 */
export function applyAdoption(
  ctx: SessionContext,
  record: FormRecoveryEntry,
  hold: { release: () => void } | null,
): boolean {
  const { runtime, store } = ctx;

  const result = restoreEntry(ctx, record);
  if (!result) {
    hold?.release();
    void removeRecord(record.key);
    logger.warn('An unsent input could not be read back', {
      formId: record.formId,
    });
    return false;
  }

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

  // Adopting an input writes it once: the other tabs learn of it through the
  // change (a lock alone sends no event), the session id says who owns it when
  // there are no Web Locks, and a send left without a verdict is taken
  // knowingly, so that its warning does not come back at every visit.
  const now = ctx.now();
  const retentionDays =
    ctx.config.descriptor.retentionDays ?? FORM_RECOVERY_DEFAULT_RETENTION_DAYS;
  replaceRecord(
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
  return true;
}

/** Adopts the entry an "Undo" of a cancelled form brought back, if it is there. */
export function adoptPendingUndo(ctx: SessionContext, lineageId: string) {
  const entry = readScope(ctx.runtime.scope, ctx.now()).entries.find(
    (item) => item.lineageId === lineageId,
  );
  return entry ? applyAdoption(ctx, entry, null) : false;
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

  const adopted = applyAdoption(
    ctx,
    record,
    hold.status === 'held' ? hold : null,
  );
  await refresh(ctx);
  return adopted;
}

/** "Resume": adopts the entry on offer. */
export async function resume(ctx: SessionContext): Promise<void> {
  const candidate = currentCandidate(ctx.store.state);
  if (candidate) await adoptEntry(ctx, candidate.key);
}
