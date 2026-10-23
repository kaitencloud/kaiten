import {
  FORM_RECOVERY_MARK_RETENTION_HOURS,
  type FormRecoveryScopeSnapshot,
} from '@/lib/form-recovery';
import type { SessionContext } from './session-context';
import {
  onRefused,
  setWriter,
  startNewLineage,
  writeSnapshot,
} from './session-writer';

/** An input is kept up for a day: a tombstone could have expired since. */
const SELF_HEAL_WINDOW_MS = FORM_RECOVERY_MARK_RETENTION_HOURS * 3_600_000;

/**
 * What this mount sees of its own lineage in the storage: a tombstone another
 * tab wrote, a sign-out, a record that vanished. Never rewrites what a person
 * ended on purpose.
 */
export function observeOwnLineage(
  ctx: SessionContext,
  scope: FormRecoveryScopeSnapshot,
) {
  const { runtime, store } = ctx;
  const { status } = store.state.writer;
  if (
    ['reading', 'disabled', 'discarded', 'submitting', 'submitted'].includes(
      status,
    )
  ) {
    return;
  }

  if (scope.userMark && scope.userMark.signedOutAt > runtime.mountedAt) {
    setWriter(ctx, { status: 'disabled' });
    return;
  }

  const { lineageId } = store.state;
  const tombstone = scope.tombstones.find(
    (item) => item.lineageId === lineageId,
  );
  if (tombstone) {
    onRefused(ctx, 'tombstoned');
    return;
  }
  if (status === 'paused' || status === 'sentElsewhere') return;

  const entry = scope.entries.find((item) => item.lineageId === lineageId);
  if (entry) {
    runtime.lastSeenAt = ctx.now().getTime();
    // Without Web Locks the session id says who owns the lineage.
    if (!runtime.lockSupported && entry.sessionId !== runtime.sessionId) {
      setWriter(ctx, { status: 'paused', reason: 'otherTab' });
    }
    return;
  }

  if (!runtime.ownRecordExpected) return;
  const seenRecently =
    runtime.lastSeenAt !== null &&
    ctx.now().getTime() - runtime.lastSeenAt < SELF_HEAL_WINDOW_MS;
  if (seenRecently && runtime.snapshot) {
    // A race between two tabs rewrote the whole blob: write it again.
    writeSnapshot(ctx, { status: 'editing', force: true });
  } else {
    setWriter(ctx, { status: 'paused', reason: 'unknown' });
  }
}

/** "Keep them here": take the lineage back, or begin a new one. */
export function keepHere(ctx: SessionContext) {
  const { writer } = ctx.store.state;
  if (writer.status !== 'paused') return;

  // With Web Locks, another tab that holds the lineage keeps it: this one
  // begins its own. Without them, the session id is all there is to decide who
  // owns the lineage, and this tab takes it over.
  if (writer.reason === 'otherTab' && !ctx.runtime.lockSupported) {
    setWriter(ctx, { status: 'saved' });
    writeSnapshot(ctx, { status: 'editing', force: true });
    return;
  }

  startNewLineage(ctx);
  setWriter(ctx, { status: 'dirty' });
  writeSnapshot(ctx, { status: 'editing', force: true });
}
