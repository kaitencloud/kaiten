import {
  DuplicateKeyError,
  SchemaValidationError,
  UpdateKeyNotFoundError,
} from '@tanstack/react-db';
import { logger } from '@/lib/logger';
import type { FormRecoveryRuntime } from './form-recovery-collection';
import {
  FORM_RECOVERY_ENVELOPE,
  FORM_RECOVERY_MARK_RETENTION_HOURS,
  formRecoveryRecordSchema,
  type FormRecoveryEntry,
  type FormRecoveryRecord,
  type FormRecoveryScope,
  type FormRecoveryTombstone,
  type FormRecoveryUserMark,
} from './form-recovery-record';

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'unavailable' | 'serialization' };

/** Why a write was refused before anything was written. */
export type SaveRefusal =
  | 'tombstoned'
  | 'signed-out'
  | 'too-large'
  | 'disabled'
  | 'invalid'
  | 'missing';

export type SaveHandle =
  | { written: false; reason: SaveRefusal }
  /**
   * The storage was written, synchronously. Its verdict comes as a promise: a
   * failure of the storage (a full quota) is raised in a microtask, by the
   * rejection of the transaction, after a rollback.
   */
  | { written: true; persisted: Promise<SaveResult> };

export type FormRecoveryScopeSnapshot = {
  entries: FormRecoveryEntry[];
  tombstones: FormRecoveryTombstone[];
  userMark: FormRecoveryUserMark | null;
};

export type SentTombstoneInput = {
  scope: FormRecoveryScope & { lineageId: string };
  at: Date;
  created: { id: string; label: string | null } | null;
  /** A next request of the chain has yet to succeed. */
  followUp: boolean;
};

export const HOUR_MS = 60 * 60 * 1000;

export function refused(reason: SaveRefusal): SaveHandle {
  return { written: false, reason };
}

export function markExpiry(at: Date): string {
  return new Date(
    at.getTime() + FORM_RECOVERY_MARK_RETENTION_HOURS * HOUR_MS,
  ).toISOString();
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * TanStack DB hands the failure of the storage back as a plain `Error` whose
 * message names the original one, so the name alone is not enough.
 */
function classifySaveError(error: unknown): 'quota' | 'unavailable' {
  const { name, code, message } = (error ?? {}) as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };

  if (
    code === 22 ||
    code === 1014 ||
    [name, message].some(
      (text) => typeof text === 'string' && /quota/i.test(text),
    )
  ) {
    return 'quota';
  }
  return 'unavailable';
}

type PersistedTransaction = { isPersisted: { promise: Promise<unknown> } };

/** Turns the verdict of a transaction into a value; never rejects. */
export function settle(transaction: PersistedTransaction): Promise<SaveResult> {
  return transaction.isPersisted.promise.then(
    (): SaveResult => ({ ok: true }),
    (error: unknown): SaveResult => ({
      ok: false,
      reason: classifySaveError(error),
    }),
  );
}

export function parseRecord(raw: unknown): FormRecoveryRecord | null {
  const parsed = formRecoveryRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function readRecordFrom(
  runtime: FormRecoveryRuntime,
  key: string,
): FormRecoveryRecord | null {
  return parseRecord(runtime.collection.get(key));
}

export function isExpired(record: FormRecoveryRecord, now: Date): boolean {
  return new Date(record.expiresAt).getTime() <= now.getTime();
}

/** Deletes records; a failure is swallowed, there is nothing to tell. */
export function deleteKeys(
  runtime: FormRecoveryRuntime,
  keys: readonly string[],
): Promise<SaveResult> {
  const present = keys.filter((key) => runtime.collection.has(key));
  if (present.length === 0) {
    return Promise.resolve({ ok: true });
  }

  try {
    return settle(runtime.collection.delete(present));
  } catch {
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }
}

/**
 * Replaces the record under a key, whole. TanStack DB merges an update, so the
 * keys the new record lacks are deleted from the draft: the proxy hands a
 * deleted key over as `undefined`, which plain JSON does not write. A tombstone
 * that replaces an entry thus holds none of its values.
 *
 * Another tab may have created or removed the key since this one last read:
 * the loser of that race tries the other way round.
 */
function writeRecord(
  runtime: FormRecoveryRuntime,
  next: FormRecoveryRecord,
): PersistedTransaction {
  const { collection } = runtime;

  const insert = () => collection.insert(next);
  const replace = () =>
    collection.update(next.key, (draft) => {
      const target = draft as unknown as Record<string, unknown>;
      for (const key of Object.keys(target)) {
        if (!(key in next)) {
          delete target[key];
        }
      }
      Object.assign(target, next);
    });

  try {
    return collection.has(next.key) ? replace() : insert();
  } catch (error) {
    if (error instanceof DuplicateKeyError) {
      return replace();
    }
    if (error instanceof UpdateKeyNotFoundError) {
      return insert();
    }
    throw error;
  }
}

export function toHandle(
  runtime: FormRecoveryRuntime,
  record: FormRecoveryRecord,
): SaveHandle {
  try {
    return { written: true, persisted: settle(writeRecord(runtime, record)) };
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      logger.warn('A form recovery record was refused by its schema');
      return refused('invalid');
    }
    logger.warn('A form recovery record could not be written');
    return refused('disabled');
  }
}

export function toTombstone(
  entry: FormRecoveryEntry,
  reason: FormRecoveryTombstone['reason'],
  at: Date,
): FormRecoveryTombstone {
  return {
    kind: 'tombstone',
    key: entry.key,
    envelope: FORM_RECOVERY_ENVELOPE,
    userId: entry.userId,
    organizationId: entry.organizationId,
    formId: entry.formId,
    context: entry.context,
    lineageId: entry.lineageId,
    reason,
    at: at.toISOString(),
    expiresAt: markExpiry(at),
    created: null,
    followUp: false,
    followUpSeen: false,
  };
}
