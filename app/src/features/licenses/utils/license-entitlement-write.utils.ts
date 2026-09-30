import type { LicenseEntitlementWritable } from '@/api-client';
import {
  isUnlimitedThreshold,
  resolveLimitCapExceededOveragePercent,
  UNLIMITED_THRESHOLD,
} from '@/domains/entitlement-usage';
import type { EditableLicenseEntitlement } from './license-entitlements.utils';
import {
  parseOveragePercentInput,
  parseThresholdInput,
} from './license-entitlements.utils';

export type LicenseEntitlementWriteValue = LicenseEntitlementWritable['value'];

type LicenseEntitlementValueSource = Pick<
  EditableLicenseEntitlement,
  'configValue' | 'enabled' | 'entitlementType' | 'threshold'
>;

type LicenseEntitlementWriteSource = LicenseEntitlementValueSource & {
  limitCapExceededOveragePercent?: number | null;
};

export const buildLicenseEntitlementValue = ({
  configValue,
  enabled,
  entitlementType,
  threshold,
}: LicenseEntitlementValueSource): LicenseEntitlementWriteValue => {
  if (entitlementType === 'NUMBER') {
    return { type: 'number', value: threshold ?? UNLIMITED_THRESHOLD };
  }

  if (entitlementType === 'CONFIG') {
    return { type: 'object', value: configValue ?? {} };
  }

  return { type: 'boolean', value: enabled ?? true };
};

// The API derives enforcement from the (value, percent) pair and resets an
// omitted percent to its default, so a numeric grant always carries both;
// BOOLEAN and CONFIG grants must not carry the percent at all.
export const buildAssociateLicenseEntitlementBody = (
  entitlementSlug: string,
  source: LicenseEntitlementWriteSource,
): LicenseEntitlementWritable => ({
  entitlementSlug,
  limitCapExceededOveragePercent:
    source.entitlementType === 'NUMBER'
      ? resolveLimitCapExceededOveragePercent(
          source.threshold ?? UNLIMITED_THRESHOLD,
          source.limitCapExceededOveragePercent,
        )
      : undefined,
  value: buildLicenseEntitlementValue(source),
});

export const buildUpdateLicenseEntitlementBody = (
  threshold: number,
  limitCapExceededOveragePercent?: number | null,
): LicenseEntitlementWritable => ({
  limitCapExceededOveragePercent: resolveLimitCapExceededOveragePercent(
    threshold,
    limitCapExceededOveragePercent,
  ),
  value: { type: 'number', value: threshold },
});

export type InlineEditField = 'overagePercent' | 'threshold';

export type InlineEditSaveResolution =
  | { kind: 'invalid'; errorKey: string }
  | { kind: 'noop' }
  | { kind: 'save'; limitCapExceededOveragePercent: number; threshold: number };

// Turns what was typed in one cell into the full (threshold, percent) pair to
// send, taking the other half from the row as it currently stands.
export const resolveInlineEditSave = (
  field: InlineEditField,
  rawInput: string,
  row: Pick<
    EditableLicenseEntitlement,
    'limitCapExceededOveragePercent' | 'threshold'
  >,
  unlimitedTokens: string[] = [],
): InlineEditSaveResolution => {
  if (field === 'threshold') {
    const threshold = parseThresholdInput(rawInput, unlimitedTokens);

    if (threshold === null) {
      return {
        errorKey: 'Pages.Licenses.Entitlements.thresholdError',
        kind: 'invalid',
      };
    }

    return {
      kind: 'save',
      limitCapExceededOveragePercent: resolveLimitCapExceededOveragePercent(
        threshold,
        row.limitCapExceededOveragePercent,
      ),
      threshold,
    };
  }

  // The row may have turned unlimited under an open overage edit (a refetch
  // landed); there is no cap to bound any more, so there is nothing to send.
  if (isUnlimitedThreshold(row.threshold)) {
    return { kind: 'noop' };
  }

  const percent = parseOveragePercentInput(rawInput);

  if (percent === null) {
    return {
      errorKey: 'Pages.Licenses.Entitlements.overagePercentError',
      kind: 'invalid',
    };
  }

  const threshold = row.threshold ?? UNLIMITED_THRESHOLD;

  return {
    kind: 'save',
    limitCapExceededOveragePercent: resolveLimitCapExceededOveragePercent(
      threshold,
      percent,
    ),
    threshold,
  };
};
