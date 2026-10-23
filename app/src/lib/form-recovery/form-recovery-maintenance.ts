import type { SessionIdentity } from '@/lib/session-identity';
import {
  getFormRecoveryRuntime,
  type FormRecoveryRuntime,
} from './form-recovery-collection';
import {
  deleteKeys,
  isExpired,
  markExpiry,
  parseRecord,
  toHandle,
  toTombstone,
} from './form-recovery-io';
import { buildScopeKey, buildUserMarkKey } from './form-recovery-keys';
import {
  FORM_RECOVERY_ENVELOPE,
  FORM_RECOVERY_MAX_LINEAGES_PER_SCOPE,
  FORM_RECOVERY_MAX_RECORDS,
  type FormRecoveryEntry,
  type FormRecoveryUserMark,
} from './form-recovery-record';

function sortOldestFirst(entries: FormRecoveryEntry[]): FormRecoveryEntry[] {
  return [...entries].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

type Pruning = { remove: string[]; evict: FormRecoveryEntry[] };

function planPruning(
  runtime: FormRecoveryRuntime,
  now: Date,
  identity: SessionIdentity | null,
  keep: ReadonlySet<string>,
): Pruning {
  const remove: string[] = [];
  const entries: FormRecoveryEntry[] = [];

  for (const [key, raw] of runtime.collection.entries()) {
    const record = parseRecord(raw);
    if (!record || isExpired(record, now)) {
      remove.push(key);
    } else if (identity && record.userId !== identity.userId) {
      remove.push(key);
    } else if (record.kind === 'entry') {
      entries.push(record);
    }
  }

  const evict = new Map<string, FormRecoveryEntry>();
  const evictable = (entry: FormRecoveryEntry) =>
    !keep.has(entry.key) && !evict.has(entry.key);

  const perScope = new Map<string, FormRecoveryEntry[]>();
  for (const entry of entries) {
    const scopeKey = buildScopeKey(entry);
    perScope.set(scopeKey, [...(perScope.get(scopeKey) ?? []), entry]);
  }
  for (const group of perScope.values()) {
    let excess = group.length - FORM_RECOVERY_MAX_LINEAGES_PER_SCOPE;
    for (const entry of sortOldestFirst(group)) {
      if (excess <= 0) break;
      if (evictable(entry)) {
        evict.set(entry.key, entry);
        excess -= 1;
      }
    }
  }

  let excess = entries.length - evict.size - FORM_RECOVERY_MAX_RECORDS;
  for (const entry of sortOldestFirst(entries)) {
    if (excess <= 0) break;
    if (evictable(entry)) {
      evict.set(entry.key, entry);
      excess -= 1;
    }
  }

  return { remove, evict: [...evict.values()] };
}

/**
 * Housekeeping: removes the expired and invalid records and, when an identity
 * is known, the records of other users; evicts the oldest entries beyond the
 * limits, as tombstones, never one a tab holds (`keep`). Writes nothing when
 * there is nothing to remove.
 */
export async function pruneRecords(
  now: Date,
  identity: SessionIdentity | null,
  keep: ReadonlySet<string>,
): Promise<void> {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return;
  }

  runtime.resync();
  const { remove, evict } = planPruning(runtime, now, identity, keep);

  await deleteKeys(runtime, remove);
  for (const entry of evict) {
    const handle = toHandle(runtime, toTombstone(entry, 'evicted', now));
    if (handle.written) {
      await handle.persisted;
    }
  }
}

/**
 * Makes room: removes what expired and evicts the oldest entry that no tab
 * holds. True when something was freed.
 */
export async function evictOldestEntry(
  now: Date,
  keep: ReadonlySet<string>,
): Promise<boolean> {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return false;
  }

  runtime.resync();
  const { remove } = planPruning(runtime, now, null, keep);
  const entries: FormRecoveryEntry[] = [];
  for (const [, raw] of runtime.collection.entries()) {
    const record = parseRecord(raw);
    if (record?.kind === 'entry' && !keep.has(record.key)) {
      entries.push(record);
    }
  }

  const [oldest] = sortOldestFirst(entries);
  const removed = await deleteKeys(runtime, remove);
  if (!oldest) {
    return removed.ok && remove.length > 0;
  }

  const handle = toHandle(runtime, toTombstone(oldest, 'evicted', now));
  return handle.written ? (await handle.persisted).ok : false;
}

/**
 * An explicit sign-out: removes everything, then leaves a mark for the user
 * that no write older than it may pass. The sign-out screen reads the user
 * from the tab's session storage, which outlives the navigation that ends a
 * Clerk sign-out; without one there is no one to mark, and the purge alone
 * protects the storage. A session that merely expired marks nothing.
 */
export function purgeAllFormRecovery(
  userId: string | null,
  now: Date = new Date(),
): void {
  const runtime = getFormRecoveryRuntime();
  if (!runtime) {
    return;
  }

  runtime.resync();
  void deleteKeys(runtime, [...runtime.collection.keys()]);

  if (userId) {
    const mark: FormRecoveryUserMark = {
      kind: 'userMark',
      key: buildUserMarkKey(userId),
      envelope: FORM_RECOVERY_ENVELOPE,
      userId,
      signedOutAt: now.toISOString(),
      expiresAt: markExpiry(now),
    };
    toHandle(runtime, mark);
  }
}
