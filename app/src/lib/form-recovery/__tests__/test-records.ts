import { buildRecordKey, buildScopeKey } from '../form-recovery-keys';
import {
  FORM_RECOVERY_ENVELOPE,
  type FormRecoveryEntry,
  type FormRecoveryScope,
  type FormRecoveryTombstone,
} from '../form-recovery-record';

export const SCOPE: FormRecoveryScope = {
  userId: 'user_1',
  organizationId: 'org_1',
  formId: 'things.create',
  context: '',
};

const NOW = new Date('2026-10-23T10:00:00.000Z');

export function isoAfter(base: Date, ms: number): string {
  return new Date(base.getTime() + ms).toISOString();
}

export function makeEntry(
  overrides: Partial<FormRecoveryEntry> & { lineageId?: string } = {},
): FormRecoveryEntry {
  const scope = { ...SCOPE, ...overrides };
  const lineageId = overrides.lineageId ?? 'lineage-1';

  return {
    kind: 'entry',
    key: buildRecordKey(buildScopeKey(scope), lineageId),
    envelope: FORM_RECOVERY_ENVELOPE,
    userId: scope.userId,
    organizationId: scope.organizationId,
    formId: scope.formId,
    context: scope.context,
    lineageId,
    sessionId: 'session-1',
    formVersion: 1,
    status: 'editing',
    attempt: 0,
    attemptedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    expiresAt: isoAfter(NOW, 7 * 24 * 3_600_000),
    stepId: null,
    furthestStepId: null,
    stepIds: null,
    payload: '[["name","Gold"]]',
    omittedFilled: [],
    labels: { 'license-1': 'Gold' },
    extra: null,
    extraSource: null,
    ...overrides,
  };
}

export function makeTombstone(
  overrides: Partial<FormRecoveryTombstone> & { lineageId?: string } = {},
): FormRecoveryTombstone {
  const scope = { ...SCOPE, ...overrides };
  const lineageId = overrides.lineageId ?? 'lineage-1';

  return {
    kind: 'tombstone',
    key: buildRecordKey(buildScopeKey(scope), lineageId),
    envelope: FORM_RECOVERY_ENVELOPE,
    userId: scope.userId,
    organizationId: scope.organizationId,
    formId: scope.formId,
    context: scope.context,
    lineageId,
    reason: 'sent',
    at: NOW.toISOString(),
    expiresAt: isoAfter(NOW, 24 * 3_600_000),
    created: null,
    followUp: false,
    followUpSeen: false,
    ...overrides,
  };
}

export { NOW };
