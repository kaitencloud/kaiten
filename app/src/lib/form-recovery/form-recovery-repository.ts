import { logger } from '@/lib/logger';
import { getFormRecoveryRuntime } from './form-recovery-collection';
import {
  deleteKeys,
  isExpired,
  markExpiry,
  parseRecord,
  readRecordFrom,
  refused,
  toHandle,
  toTombstone,
  byteLength,
  type FormRecoveryScopeSnapshot,
  type SaveHandle,
  type SentTombstoneInput,
} from './form-recovery-io';
import {
  buildRecordKey,
  buildScopeKey,
  buildUserMarkKey,
} from './form-recovery-keys';
import {
  FORM_RECOVERY_ENVELOPE,
  FORM_RECOVERY_MAX_RECORD_BYTES,
  type FormRecoveryEntry,
  type FormRecoveryRecord,
  type FormRecoveryScope,
  type FormRecoveryTombstone,
} from './form-recovery-record';

export type {
  FormRecoveryScopeSnapshot,
  SaveHandle,
  SaveRefusal,
  SaveResult,
  SentTombstoneInput,
} from './form-recovery-io';

/** Reads the storage again, then one record. */
export function readFormRecoveryRecord(key: string): FormRecoveryRecord | null {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return null;
  }
  runtime.resync();
  return readRecordFrom(runtime, key);
}

/**
 * The entries, tombstones and sign-out mark of a scope, after a resync.
 * Expired and invalid records found on the way are removed, silently.
 */
export function readScope(
  scope: FormRecoveryScope,
  now: Date = new Date(),
): FormRecoveryScopeSnapshot {
  const snapshot: FormRecoveryScopeSnapshot = {
    entries: [],
    tombstones: [],
    userMark: null,
  };
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return snapshot;
  }

  runtime.resync();
  const scopeKey = buildScopeKey(scope);
  const markKey = buildUserMarkKey(scope.userId);
  const stale: string[] = [];

  for (const [key, raw] of runtime.collection.entries()) {
    const record = parseRecord(raw);
    if (!record || isExpired(record, now)) {
      stale.push(key);
      continue;
    }

    if (record.kind === 'userMark') {
      if (record.key === markKey) {
        snapshot.userMark = record;
      }
    } else if (buildScopeKey(record) === scopeKey) {
      (record.kind === 'entry' ? snapshot.entries : snapshot.tombstones).push(
        record as never,
      );
    }
  }

  void deleteKeys(runtime, stale);
  return snapshot;
}

/**
 * Writes an entry, replacing what the lineage held. The checks come after a
 * resync, so a write that was delayed past a send, a discard or a sign-out in
 * another tab is refused instead of resurrecting what they ended:
 *
 * - `tombstoned`: the lineage has a tombstone;
 * - `signed-out`: the user signed out after this tab mounted;
 * - `too-large`: the record outgrows the limit; the older record of the
 *   lineage is removed, since offering a version older than what the person
 *   typed since would be worse than offering nothing.
 */
export function replaceRecord(
  next: FormRecoveryEntry,
  guard: { mountedAt: string },
): SaveHandle {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return refused('disabled');
  }

  runtime.resync();
  const existing = readRecordFrom(runtime, next.key);
  if (existing?.kind === 'tombstone') {
    return refused('tombstoned');
  }

  const mark = readRecordFrom(runtime, buildUserMarkKey(next.userId));
  if (mark?.kind === 'userMark' && mark.signedOutAt > guard.mountedAt) {
    return refused('signed-out');
  }

  if (byteLength(JSON.stringify(next)) > FORM_RECOVERY_MAX_RECORD_BYTES) {
    void deleteKeys(runtime, [next.key]);
    logger.warn('A form recovery record is too large to be kept', {
      formId: next.formId,
    });
    return refused('too-large');
  }

  return toHandle(runtime, next);
}

/**
 * The server accepted a send: the entry becomes a tombstone with no values.
 * Never gated by a guard, whatever the state of the tab that sends: it is
 * always attempted, since it is what keeps a sent form from being offered.
 */
export function markSent(input: SentTombstoneInput): SaveHandle {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return refused('disabled');
  }

  runtime.resync();
  const { scope } = input;
  const tombstone: FormRecoveryTombstone = {
    kind: 'tombstone',
    key: buildRecordKey(buildScopeKey(scope), scope.lineageId),
    envelope: FORM_RECOVERY_ENVELOPE,
    userId: scope.userId,
    organizationId: scope.organizationId,
    formId: scope.formId,
    context: scope.context,
    lineageId: scope.lineageId,
    reason: 'sent',
    at: input.at.toISOString(),
    expiresAt: markExpiry(input.at),
    created: input.created,
    followUp: input.followUp,
    followUpSeen: false,
  };

  return toHandle(runtime, tombstone);
}

/** The entry of a lineage becomes a tombstone, with no values. */
export function discardRecord(
  entryKey: string,
  reason: 'discarded' | 'evicted',
  now: Date = new Date(),
): SaveHandle {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return refused('disabled');
  }

  runtime.resync();
  const existing = readRecordFrom(runtime, entryKey);
  if (existing?.kind !== 'entry') {
    return refused(existing ? 'tombstoned' : 'missing');
  }

  return toHandle(runtime, toTombstone(existing, reason, now));
}

/** Updates a tombstone: the notice of a chain that stayed unfinished. */
export function updateTombstone(
  key: string,
  changes: Partial<Pick<FormRecoveryTombstone, 'followUp' | 'followUpSeen'>>,
): SaveHandle {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return refused('disabled');
  }

  runtime.resync();
  const existing = readRecordFrom(runtime, key);
  if (existing?.kind !== 'tombstone') {
    return refused('missing');
  }

  return toHandle(runtime, { ...existing, ...changes });
}

/** Removes an entry outright: the form is back to its initial values. */
export function removeRecord(key: string): SaveHandle {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return refused('disabled');
  }

  runtime.resync();
  if (!runtime.collection.has(key)) {
    return refused('missing');
  }

  try {
    return { written: true, persisted: deleteKeys(runtime, [key]) };
  } catch {
    return refused('disabled');
  }
}

/**
 * Calls the listener whenever the collection changes, here or, through the
 * `storage` event, in another tab. Returns the unsubscribe function.
 */
export function subscribeToFormRecovery(listener: () => void): () => void {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return () => {};
  }

  const subscription = runtime.collection.subscribeChanges(() => listener());
  return () => subscription.unsubscribe();
}
