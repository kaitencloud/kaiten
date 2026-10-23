import {
  evictOldestEntry,
  markSent,
  removeRecord,
  setPendingUndo,
  updateTombstone,
  discardRecord,
  readFormRecoveryRecord,
  replaceRecord,
  type FormRecoveryEntry,
} from '@/lib/form-recovery';
import { logger } from '@/lib/logger';
import { classifyOutcome } from '../logic/classify-outcome';
import type {
  CreatedRef,
  FormRecoveryAttempt,
  FormRecoverySendOptions,
} from '../types';
import type { SessionContext } from './session-context';
import { reinstate } from './session-offer';
import { refresh } from './session-scope';
import {
  newLineageId,
  ownRecordKey,
  releaseHold,
  setWriter,
  writeSnapshot,
} from './session-writer';

/** In these a send is a plain request: there is nothing to settle. */
const PASS_THROUGH = new Set([
  'disabled',
  'submitted',
  'sentElsewhere',
  'discarded',
  'submitting',
]);

const PASS_THROUGH_ATTEMPT: FormRecoveryAttempt = {
  accepted: () => Promise.resolve(),
  failed: () => {},
};

/**
 * The server accepted: the entry becomes a tombstone with no values. Always
 * attempted, from a paused tab, after an earlier failed write, with the
 * storage full: it is what keeps a sent form from being offered again.
 */
async function settleAccepted(
  ctx: SessionContext,
  lineage: {
    scope: SessionContext['runtime']['scope'];
    lineageId: string;
    key: string;
  },
  created: CreatedRef | undefined,
  followUp: boolean,
): Promise<void> {
  const input = {
    scope: { ...lineage.scope, lineageId: lineage.lineageId },
    at: ctx.now(),
    created: created ? { id: created.id, label: created.label ?? null } : null,
    followUp,
  };

  let handle = markSent(input);
  let result = handle.written ? await handle.persisted : null;

  if (result && !result.ok && result.reason === 'quota') {
    const keep = new Set([...ctx.runtime.live, lineage.key]);
    if (await evictOldestEntry(ctx.now(), keep)) {
      handle = markSent(input);
      result = handle.written ? await handle.persisted : null;
    }
  }

  if (!result?.ok) {
    // Worst case the entry stays as it is: it is then offered with the
    // warning that a send may have gone through, never as a plain resume.
    const removal = removeRecord(lineage.key);
    if (removal.written) await removal.persisted;
  }
}

/**
 * Opens an attempt to send: writes the entry as `submitting` before the
 * request, so that a page that dies during it leaves a trace. The request is
 * the caller's; it settles with `accepted` or `failed`.
 */
export function beginAttempt(ctx: SessionContext): FormRecoveryAttempt {
  const { runtime, store } = ctx;
  if (PASS_THROUGH.has(store.state.writer.status)) {
    return PASS_THROUGH_ATTEMPT;
  }

  ctx.cancelWrite();
  const lineage = {
    scope: runtime.scope,
    lineageId: store.state.lineageId,
    key: ownRecordKey(ctx),
  };
  const previousAttemptedAt = runtime.attemptedAt;
  const previousAttempt = runtime.attempt;
  const startedAt = ctx.now().toISOString();

  setWriter(ctx, { status: 'submitting' });
  ctx.setState({ unknownOutcome: false });
  // Even when the write is refused (too large, full), the send goes out.
  writeSnapshot(ctx, {
    status: 'submitting',
    attemptedAt: startedAt,
    force: true,
  });

  const settleRefusedOrUnknown = (error: unknown) => {
    const outcome = classifyOutcome(error);
    const entry = readFormRecoveryRecord(lineage.key);
    const next: Partial<FormRecoveryEntry> =
      outcome === 'refused'
        ? { attempt: previousAttempt + 1, attemptedAt: previousAttemptedAt }
        : { attempt: previousAttempt, attemptedAt: startedAt };

    if (entry?.kind === 'entry') {
      // Rewritten as it was read, with the verdict of the send in it.
      replaceRecord(
        { ...entry, ...next, status: 'editing' },
        { mountedAt: runtime.mountedAt },
      );
    }
    runtime.attempt = next.attempt ?? previousAttempt;
    runtime.attemptedAt = next.attemptedAt ?? null;
    if (runtime.alive) {
      setWriter(ctx, { status: 'saved' });
      ctx.setState({ unknownOutcome: outcome === 'unknown' });
    }
  };

  return {
    accepted: async (created, options) => {
      try {
        await settleAccepted(ctx, lineage, created, options?.followUp ?? false);
      } catch (error) {
        logger.warn('The sent input could not be marked as sent', {
          formId: ctx.config.descriptor.formId,
          error: String(error),
        });
      }
      releaseHold(ctx);
      runtime.ownRecordExpected = false;
      runtime.lastWritten = null;
      if (runtime.alive) {
        setWriter(ctx, { status: 'submitted' });
        ctx.setState({
          unknownOutcome: false,
          followUpPending: options?.followUp ?? false,
        });
      }
    },
    failed: settleRefusedOrUnknown,
  };
}

/** The one road to "sent". Rejects what `request` rejects. */
export async function sendRequest<T>(
  ctx: SessionContext,
  request: () => Promise<T>,
  options?: FormRecoverySendOptions<T>,
): Promise<T> {
  const attempt = beginAttempt(ctx);

  let result: T;
  try {
    result = await request();
  } catch (error) {
    attempt.failed(error);
    throw error;
  }

  // Past this point nothing can make the send fail: a throw of the callback
  // that names the created object is logged, never taken for a refusal.
  let created: CreatedRef | undefined;
  try {
    created = options?.created?.(result);
  } catch (error) {
    logger.warn('The created object could not be named', {
      formId: ctx.config.descriptor.formId,
      error: String(error),
    });
  }
  await attempt.accepted(created, { followUp: options?.followUp });
  return result;
}

/** The next request of a chain succeeded: the notice about it goes. */
export function completeChain(ctx: SessionContext) {
  const { store } = ctx;
  if (store.state.writer.status !== 'submitted') return;

  void updateTombstone(ownRecordKey(ctx), { followUp: false });
  ctx.setState({ followUpPending: false });
}

/**
 * A deliberate abandon. The entry becomes a tombstone, so that nothing written
 * late brings it back. With `undo`, a toast offers to bring it back: the entry
 * is written again under a new lineage, which the next form of the scope
 * restores directly, and `undo` takes the person back to the form.
 */
export function discardOwn(
  ctx: SessionContext,
  options?: { undo?: () => void },
) {
  const { runtime, store } = ctx;
  const status = store.state.writer.status;
  if (PASS_THROUGH.has(status) && status !== 'discarded') return;

  ctx.cancelWrite();
  const key = ownRecordKey(ctx);
  const stored = runtime.ownRecordExpected ? readFormRecoveryRecord(key) : null;
  const copy = stored?.kind === 'entry' ? stored : null;

  if (copy) discardRecord(key, 'discarded');
  releaseHold(ctx);
  runtime.ownRecordExpected = false;
  runtime.lastWritten = null;
  setWriter(ctx, { status: 'discarded' });

  if (!copy || !options?.undo) return;
  const { undo } = options;

  ctx.config.notify('cancelled', () => {
    const entry = reinstate(ctx, copy);
    if (!entry) return;
    setPendingUndo(runtime.scopeKey, entry.lineageId);
    undo();
  });
}

/** "Create another" after a success: a new lineage and a fresh subtree. */
export function restart(ctx: SessionContext) {
  const { runtime, store } = ctx;
  if (store.state.writer.status === 'disabled') return;

  ctx.cancelWrite();
  releaseHold(ctx);
  runtime.epoch += 1;
  runtime.snapshot = null;
  runtime.lastWritten = null;
  runtime.lastTracked = null;
  runtime.createdAt = null;
  runtime.attempt = 0;
  runtime.attemptedAt = null;
  runtime.ownRecordExpected = false;

  ctx.setState({
    lineageId: newLineageId(),
    generation: store.state.generation + 1,
    restored: null,
    notes: [],
    omittedReminder: [],
    writer: { status: 'idle' },
    offerMode: 'offering',
    condensedChanges: 0,
    unknownOutcome: false,
    followUpPending: false,
  });
  void refresh(ctx);
}
