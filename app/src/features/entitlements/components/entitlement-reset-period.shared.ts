import { z } from 'zod';
import type { EntitlementWritable, Entitlement } from '@/api-client';

// The select cannot hold an empty value, so "no period at all" travels through
// the form as an explicit sentinel and is mapped back to an absent field on
// submit by resolveResetFields.
export const RESET_PERIOD_NONE = 'NONE';

export const RESET_PERIOD_VALUES = [
  RESET_PERIOD_NONE,
  'HOUR',
  'DAY',
  'WEEK',
  'MONTH',
  'YEAR',
] as const;

export const RESET_ANCHOR_VALUES = ['CALENDAR', 'LICENSE_START'] as const;

export const resetPeriodSchema = z.enum(RESET_PERIOD_VALUES);
export const resetAnchorSchema = z.enum(RESET_ANCHOR_VALUES);

export type ResetPeriodFormValue = z.infer<typeof resetPeriodSchema>;
export type ResetAnchorFormValue = z.infer<typeof resetAnchorSchema>;

type ResetFieldsSource = {
  type?: EntitlementWritable['type'];
  aggregationMethod?: EntitlementWritable['aggregationMethod'];
  resetPeriod: ResetPeriodFormValue;
  resetAnchor: ResetAnchorFormValue;
};

// Both keys are always present, so spreading this over a body reliably
// overrides the form's sentinel instead of merely maybe-overriding it.
type ResetFields = {
  resetPeriod: EntitlementWritable['resetPeriod'];
  resetAnchor: EntitlementWritable['resetAnchor'];
};

/**
 * Mirrors the API's number-family check: a periodic window is only meaningful
 * for a type that reports a numeric meter.
 */
const isNumberFamily = (type: EntitlementWritable['type']): boolean =>
  type === 'NUMBER' || type === 'NUMBER_AI_CREDIT';

/**
 * Resolves the periodic-window pair of a writable payload.
 *
 * The window is a one-way door on the API side: once an entitlement stores a
 * reset period it can never be changed nor removed, so an entitlement that
 * already has one echoes its stored pair back untouched -- a full-replace PUT
 * that altered or omitted them would be rejected with a 400. Only an
 * entitlement without a period can still adopt one from the form.
 *
 * A window is meaningless outside a NUMBER meter and incompatible with the
 * LATEST aggregation, so both fields are dropped in those cases rather than
 * sent for the API to refuse.
 */
export const resolveResetFields = (
  values: ResetFieldsSource,
  entitlement?: Entitlement,
): ResetFields => {
  if (entitlement?.resetPeriod) {
    return {
      resetPeriod: entitlement.resetPeriod,
      resetAnchor: entitlement.resetAnchor,
    };
  }

  if (
    !isNumberFamily(values.type) ||
    values.aggregationMethod === 'LATEST' ||
    values.resetPeriod === RESET_PERIOD_NONE
  ) {
    return { resetPeriod: undefined, resetAnchor: undefined };
  }

  return {
    resetPeriod: values.resetPeriod,
    // The API requires the anchor exactly when a period is set.
    resetAnchor: values.resetAnchor ?? 'CALENDAR',
  };
};

/**
 * True when the stored entitlement has already walked through the one-way
 * door, which is exactly when the form must stop offering the two fields for
 * edit.
 */
export const hasImmutableResetPeriod = (entitlement?: Entitlement): boolean =>
  Boolean(entitlement?.resetPeriod);
