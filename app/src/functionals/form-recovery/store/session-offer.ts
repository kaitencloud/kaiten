import {
  buildRecordKey,
  discardRecord,
  readFormRecoveryRecord,
  replaceRecord,
  updateTombstone,
  type FormRecoveryEntry,
} from '@/lib/form-recovery';
import { currentCandidate } from '../logic/selectors';
import type { FormRecoveryNote, FormRecoveryNotice } from '../types';
import { adoptEntry } from './session-adopt';
import type { SessionContext } from './session-context';
import { refresh } from './session-scope';
import {
  newLineageId,
  ownRecordKey,
  startNewLineage,
  writeNow,
} from './session-writer';

/** Writes an entry again under a new lineage, for an undo. */
export function reinstate(
  ctx: SessionContext,
  copy: FormRecoveryEntry,
): FormRecoveryEntry | null {
  const lineageId = newLineageId();
  const entry: FormRecoveryEntry = {
    ...copy,
    key: buildRecordKey(ctx.runtime.scopeKey, lineageId),
    lineageId,
    updatedAt: ctx.now().toISOString(),
  };
  const handle = replaceRecord(entry, { mountedAt: ctx.runtime.mountedAt });
  return handle.written ? entry : null;
}

function readEntry(key: string): FormRecoveryEntry | null {
  const record = readFormRecoveryRecord(key);
  return record?.kind === 'entry' ? record : null;
}

/** "Start over": discards the entry on offer; a toast can bring it back. */
export async function startOver(ctx: SessionContext): Promise<void> {
  const { store } = ctx;
  const candidate = currentCandidate(store.state);
  if (!candidate) return;

  const copy = readEntry(candidate.key);
  discardRecord(candidate.key, 'discarded');
  if (store.state.writer.status === 'idle') {
    startNewLineage(ctx);
  }
  ctx.setState({
    skipped: [],
    focusToken: store.state.focusToken + 1,
  });

  ctx.config.notify(
    'discarded',
    copy
      ? () => {
          if (reinstate(ctx, copy)) {
            ctx.setState({
              offerMode:
                ctx.store.state.writer.status === 'idle'
                  ? 'offering'
                  : 'condensed',
            });
            void refresh(ctx);
          }
        }
      : undefined,
  );
  await refresh(ctx);
}

/** "Show the next one". */
export function showOther(ctx: SessionContext) {
  const { store } = ctx;
  const candidate = currentCandidate(store.state);
  if (!candidate) return;

  const skipped = [...store.state.skipped, candidate.key];
  ctx.setState({
    skipped:
      skipped.length >= store.state.candidates.length
        ? [candidate.key]
        : skipped,
  });
}

/**
 * "Bring them back" from the reduced offer: the entries in progress are
 * discarded, with an undo, and the ones set aside are adopted.
 */
export async function restoreSetAside(ctx: SessionContext): Promise<void> {
  const { store } = ctx;
  const candidate = currentCandidate(store.state);
  if (!candidate) return;

  // What was typed in the last second is written first: the copy the toast
  // can bring back must be what is on screen.
  ctx.cancelWrite();
  writeNow(ctx);
  const ownKey = ownRecordKey(ctx);
  const ownCopy = ctx.runtime.ownRecordExpected ? readEntry(ownKey) : null;

  if (!(await adoptEntry(ctx, candidate.key))) return;

  if (ownCopy) {
    discardRecord(ownKey, 'discarded');
    ctx.config.notify('replaced', () => void undoReplacement(ctx, ownCopy));
  }
}

/**
 * The undo of "Bring them back": the input that was replaced is written again
 * and put back on screen, and the entries brought back return to the reduced
 * offer, with what was typed in them since.
 */
async function undoReplacement(
  ctx: SessionContext,
  ownCopy: FormRecoveryEntry,
) {
  const entry = reinstate(ctx, ownCopy);
  if (!entry || !ctx.runtime.alive) return;

  ctx.cancelWrite();
  writeNow(ctx);
  if (!(await adoptEntry(ctx, entry.key))) return;

  ctx.setState({ offerMode: 'condensed' });
  // The lock of the entries just set aside is released a moment after the
  // adoption: they are offered only once nobody looks like holding them.
  setTimeout(() => {
    if (ctx.runtime.alive) void refresh(ctx);
  }, 0);
}

/** Adds the notes a reconcile made, once each. */
export function addNotes(
  ctx: SessionContext,
  notes: readonly FormRecoveryNote[],
) {
  if (notes.length === 0) return;

  const known = new Set(
    ctx.store.state.notes.map((note) => JSON.stringify(note)),
  );
  const fresh = notes.filter((note) => !known.has(JSON.stringify(note)));
  if (fresh.length > 0) {
    ctx.setState({ notes: [...ctx.store.state.notes, ...fresh] });
  }
}

/** Forgets the never-kept fields the person has filled in again. */
export function clearOmitted(ctx: SessionContext, paths: readonly string[]) {
  const { omittedReminder } = ctx.store.state;
  const remaining = omittedReminder.filter((path) => !paths.includes(path));
  if (remaining.length !== omittedReminder.length) {
    ctx.setState({ omittedReminder: remaining });
  }
}

/** Dismisses a notice, or the notes, or the reduced offer. */
export function dismiss(
  ctx: SessionContext,
  kind: FormRecoveryNotice['kind'] | 'notes' | 'condensed',
) {
  const { runtime, store } = ctx;

  // The button that was pressed leaves the page with its notice: the focus
  // goes back to the form instead of falling to the body.
  if (kind !== 'notKept' && kind !== 'sentElsewhere') {
    ctx.setState({ focusToken: store.state.focusToken + 1 });
  }

  switch (kind) {
    case 'notes':
      ctx.setState({ notes: [] });
      return;
    case 'condensed':
      ctx.setState({ offerMode: 'hidden' });
      return;
    case 'openElsewhere':
      runtime.openElsewhereDismissed = true;
      ctx.setState({ openElsewhere: false });
      return;
    case 'lost':
      ctx.setState({ lost: null });
      return;
    case 'followUp': {
      const { followUp } = store.state;
      if (followUp) void updateTombstone(followUp.key, { followUpSeen: true });
      ctx.setState({ followUp: null });
      return;
    }
    case 'omitted':
      ctx.setState({ omittedReminder: [] });
      return;
    case 'unknownOutcome':
      ctx.setState({ unknownOutcome: false });
      return;
    case 'followUpPending':
      ctx.setState({ followUpPending: false });
      return;
    case 'notKept':
    case 'sentElsewhere':
      return;
  }
}
