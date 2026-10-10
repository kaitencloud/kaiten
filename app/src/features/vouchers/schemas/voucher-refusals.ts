import { getProblemCode, handleBillingProblem } from '@/domains/billing';
import type { AskingStep } from './voucher-steps.schema';
import type { VoucherFormValues } from './voucher.schema';

/** Where a refusal of the API is shown: the field it is about, and the step that has the field. */
export type RefusalTarget = {
  field: string;
  message: string;
  step: AskingStep;
};

type Placement = { field: string; step: AskingStep };

// The refusals of a create or an update that are about one field of the form, by their
// code without the operation (`CreateVoucher.`, `UpdateVoucher.`): the API names the
// field in prose, in `detail`, and does not locate it. Each is shown on its field, in
// the API's own words, where the person is looking.
const PLACEMENTS: Readonly<Record<string, Placement>> = {
  BoostUnsupportedEntitlementType: { field: 'grants', step: 'offer' },
  CodeConflict: { field: 'code', step: 'eligibility' },
  CurrencyRequired: { field: 'currency', step: 'offer' },
  CustomerNotFound: { field: 'restrictedCustomerSlug', step: 'eligibility' },
  DuplicateGrant: { field: 'grants', step: 'offer' },
  EntitlementNotFound: { field: 'grants', step: 'offer' },
  GrantsRequired: { field: 'grants', step: 'offer' },
  InvalidCode: { field: 'code', step: 'eligibility' },
  InvalidCurrency: { field: 'currency', step: 'offer' },
  InvalidDuration: { field: 'durationInPeriods', step: 'offer' },
  InvalidGrant: { field: 'grants', step: 'offer' },
  InvalidRedemptionRules: { field: 'minimumAmount', step: 'eligibility' },
  InvalidWindow: { field: 'expiresAt', step: 'eligibility' },
  PriceNotFound: { field: 'applicableLicensePriceIds', step: 'offer' },
  SelectedPricesRequired: { field: 'applicableLicensePriceIds', step: 'offer' },
  UnsupportedType: { field: 'voucherType', step: 'type' },
  WeakCodeUnbounded: { field: 'code', step: 'eligibility' },
};

/**
 * Where a refusal of a create or an update goes, or nothing when it is about no field
 * (a 503, a missing scope): it is then shown above the buttons. A refusal of the
 * discount is about the percentage or the amount, whichever the voucher takes.
 */
export function getVoucherRefusalTarget(
  error: unknown,
  values: Pick<VoucherFormValues, 'priceDiscountType'>,
): RefusalTarget | null {
  const code = getProblemCode(error);
  const problem = handleBillingProblem(error);
  const name = code?.split('.')[1];

  if (!name || !problem.detail) {
    return null;
  }
  if (name === 'InvalidApplicability') {
    // One code for an id that is no licence version and for one that is no add-on
    // version: the API tells which in its words, and the field is the one it names.
    return {
      field: /add-on/i.test(problem.detail)
        ? 'applicableAddonIds'
        : 'applicableLicenseIds',
      message: problem.detail,
      step: 'eligibility',
    };
  }
  if (name === 'InvalidDiscount') {
    return {
      field:
        values.priceDiscountType === 'PERCENTAGE' ? 'percentage' : 'amount',
      message: problem.detail,
      step: 'offer',
    };
  }
  const placement = PLACEMENTS[name];

  return placement ? { ...placement, message: problem.detail } : null;
}
