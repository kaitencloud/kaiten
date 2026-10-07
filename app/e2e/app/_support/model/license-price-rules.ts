import type { Entitlement, LicenseEntitlement, Price } from '@/api-client';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { LicenseProblem } from './license-problem';

/**
 * What the Core API refuses when a price is written, restated for the mocks
 * that stand in for it (api/internal/modules/licenses/prices/rules.go): the
 * shape of a price, and what a metered price may meter. The refusals carry the
 * API's own codes and words, so that the console is tested against the reasons
 * it will really be given.
 */

type BillingModel = Price['billingModel'];

/** A price as it would be written: a create request, or a patch over a stored price. */
export type PriceDraft = {
  billingModel: BillingModel;
  billingPeriod?: Price['billingPeriod'];
  billingTiming: Price['billingTiming'];
  currency: string;
  displayLabel?: string;
  displayOrder: number;
  isDefault: boolean;
  /** The entitlement a metered price measures; empty on a FLAT_FEE price. */
  meteredEntitlementSlug: string;
  unitAmountDecimal: string;
};

export const isMetered = (model: BillingModel) => model !== 'FLAT_FEE';

const UNIT_AMOUNT = /^\d{1,12}(?:\.\d{1,12})?$/;

/** Checks what a draft says about itself, before anything else is read. */
export function checkShape(operation: string, draft: PriceDraft): void {
  if (
    !/^[A-Z]{3}$/.test(draft.currency) ||
    !CURRENCY_EXPONENTS.has(draft.currency)
  ) {
    throw new LicenseProblem(
      422,
      `${operation}.InvalidCurrency`,
      'currency must be an upper-case ISO 4217 code',
    );
  }
  if (!UNIT_AMOUNT.test(draft.unitAmountDecimal)) {
    throw new LicenseProblem(
      422,
      `${operation}.InvalidAmount`,
      'unitAmountDecimal must be a non-negative decimal of at most 12 integer digits and 12 decimal places, in minor units',
    );
  }
  const metered = isMetered(draft.billingModel);
  if (metered && draft.billingTiming !== 'ARREARS') {
    throw new LicenseProblem(
      422,
      `${operation}.InvalidTiming`,
      'a metered price bills in ARREARS: usage cannot be billed before it happens',
    );
  }
  if (metered !== (draft.billingPeriod === undefined)) {
    throw new LicenseProblem(
      422,
      `${operation}.InvalidPeriod`,
      'billingPeriod is required on a FLAT_FEE price and refused on a metered one',
    );
  }
  if (metered && draft.meteredEntitlementSlug === '') {
    throw new LicenseProblem(
      422,
      `${operation}.EntitlementNotGranted`,
      'a metered price needs meteredEntitlementSlug',
    );
  }
  if (!metered && draft.meteredEntitlementSlug !== '') {
    throw new LicenseProblem(
      422,
      `${operation}.InvalidPeriod`,
      'a FLAT_FEE price meters nothing: omit meteredEntitlementSlug',
    );
  }
  if (draft.isDefault && metered) {
    throw new LicenseProblem(
      422,
      `${operation}.InvalidDefault`,
      'only a FLAT_FEE price can be a default',
    );
  }
}

/** Whether a grant allows usage above its limit: a finite limit with a positive percent. */
export function overageReachable(grant: LicenseEntitlement | undefined) {
  if (!grant || grant.value.type !== 'number') {
    return false;
  }

  return (
    (grant.limitCapExceededOveragePercent ?? 0) > 0 && grant.value.value >= 0
  );
}

/**
 * Checks the entitlement a metered draft would meter against what the version
 * grants of it: only a flow is metered (a reset period, SUM or COUNT, a NUMBER
 * type), the version must grant it, an OVERAGE price needs a grant whose
 * overage can be reached, and no other ACTIVE price may meter it.
 */
export function checkMeters(
  operation: string,
  draft: PriceDraft,
  entitlement: Entitlement,
  grant: LicenseEntitlement | undefined,
  otherMeters: number,
): void {
  if (entitlement.resetPeriod === undefined) {
    throw new LicenseProblem(
      422,
      `${operation}.EntitlementIsStock`,
      'only an entitlement with a reset period can be metered: a lifetime counter is a stock, sold as an add-on',
    );
  }
  const aggregation = entitlement.aggregationMethod ?? 'SUM';
  if (aggregation !== 'SUM' && aggregation !== 'COUNT') {
    throw new LicenseProblem(
      422,
      `${operation}.UnsupportedAggregation`,
      'only a SUM or COUNT entitlement can be metered',
    );
  }
  if (
    entitlement.type !== 'NUMBER' &&
    entitlement.type !== 'NUMBER_AI_CREDIT'
  ) {
    throw new LicenseProblem(
      422,
      `${operation}.UnsupportedEntitlementType`,
      'only a NUMBER or NUMBER_AI_CREDIT entitlement can be metered',
    );
  }
  if (!grant) {
    throw new LicenseProblem(
      422,
      `${operation}.EntitlementNotGranted`,
      'the licence version does not grant this entitlement',
    );
  }
  if (draft.billingModel === 'OVERAGE' && !overageReachable(grant)) {
    throw new LicenseProblem(
      422,
      `${operation}.OverageUnreachable`,
      'the version grants this entitlement without overage (a hard or unlimited limit): an OVERAGE price could never bill',
    );
  }
  if (otherMeters > 0) {
    throw new LicenseProblem(
      422,
      `${operation}.EntitlementAlreadyMetered`,
      'another active price of this version already meters this entitlement',
    );
  }
}
