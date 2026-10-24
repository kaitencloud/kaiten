import {
  buildRecordKey,
  buildScopeKey,
  FORM_RECOVERY_DEFAULT_RETENTION_DAYS,
  FORM_RECOVERY_ENVELOPE,
  type FormRecoveryEntry,
  type FormRecoveryScope,
} from '@/lib/form-recovery';
import type { FormRecoverySnapshot } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type EntryInput = {
  scope: FormRecoveryScope;
  lineageId: string;
  sessionId: string;
  formVersion: number;
  retentionDays?: number;
  snapshot: FormRecoverySnapshot;
  status: FormRecoveryEntry['status'];
  attempt: number;
  attemptedAt: string | null;
  createdAt: string | null;
  now: Date;
};

/** The record a session writes: complete, every optional field present. */
export function buildEntry(input: EntryInput): FormRecoveryEntry {
  const { scope, snapshot, now } = input;
  const retentionDays =
    input.retentionDays ?? FORM_RECOVERY_DEFAULT_RETENTION_DAYS;

  return {
    kind: 'entry',
    key: buildRecordKey(buildScopeKey(scope), input.lineageId),
    envelope: FORM_RECOVERY_ENVELOPE,
    userId: scope.userId,
    organizationId: scope.organizationId,
    formId: scope.formId,
    context: scope.context,
    lineageId: input.lineageId,
    sessionId: input.sessionId,
    formVersion: input.formVersion,
    status: input.status,
    attempt: input.attempt,
    attemptedAt: input.attemptedAt,
    createdAt: input.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + retentionDays * DAY_MS).toISOString(),
    stepId: snapshot.stepId,
    furthestStepId: snapshot.furthestStepId,
    stepIds: snapshot.stepIds,
    payload: snapshot.payload,
    omittedFilled: snapshot.omittedFilled,
    labels: snapshot.labels,
    extra: snapshot.extra,
    extraSource: snapshot.extraSource,
  };
}

/** What makes two writes of the same lineage the same write. */
export function snapshotSignature(
  snapshot: Pick<
    FormRecoverySnapshot,
    | 'payload'
    | 'extra'
    | 'extraSource'
    | 'omittedFilled'
    | 'stepId'
    | 'furthestStepId'
    | 'stepIds'
  >,
): string {
  return JSON.stringify([
    snapshot.payload,
    snapshot.extra,
    snapshot.extraSource,
    [...snapshot.omittedFilled].sort(),
    snapshot.stepId,
    snapshot.furthestStepId,
    snapshot.stepIds,
  ]);
}

/** The snapshot an entry would give, to adopt it without rewriting it. */
export function entryToSnapshot(
  entry: FormRecoveryEntry,
): FormRecoverySnapshot {
  return {
    counts: true,
    payload: entry.payload,
    omittedFilled: entry.omittedFilled,
    labels: entry.labels,
    extra: entry.extra,
    extraSource: entry.extraSource,
    stepId: entry.stepId,
    furthestStepId: entry.furthestStepId,
    stepIds: entry.stepIds,
  };
}
