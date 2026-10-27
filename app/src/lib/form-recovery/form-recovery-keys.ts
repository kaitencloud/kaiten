import type { FormRecoveryScope } from './form-recovery-record';

const KEY_SEPARATOR = '|';
const LOCK_PREFIX = 'kaiten:form-recovery:';

function encodePart(part: string): string {
  return encodeURIComponent(part);
}

/** One person, one organization, one form, one context. */
export function buildScopeKey(scope: FormRecoveryScope): string {
  return [scope.userId, scope.organizationId, scope.formId, scope.context]
    .map(encodePart)
    .join(KEY_SEPARATOR);
}

/** One unsent input, or the tombstone that replaced it. */
export function buildRecordKey(scopeKey: string, lineageId: string): string {
  return `${scopeKey}${KEY_SEPARATOR}${encodePart(lineageId)}`;
}

/** The Web Lock a tab holds while it keeps a lineage. */
export function buildLockName(recordKey: string): string {
  return `${LOCK_PREFIX}${recordKey}`;
}

/** Inverse of {@link buildLockName}, or null for a lock that is not ours. */
export function recordKeyOfLockName(lockName: string): string | null {
  return lockName.startsWith(LOCK_PREFIX)
    ? lockName.slice(LOCK_PREFIX.length)
    : null;
}

/** The mark an explicit sign-out leaves for one user. */
export function buildUserMarkKey(userId: string): string {
  return `user${KEY_SEPARATOR}${encodePart(userId)}`;
}
