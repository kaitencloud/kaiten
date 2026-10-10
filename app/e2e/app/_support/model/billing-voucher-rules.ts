import type {
  Grant,
  InstanceBilling,
  Redemption,
  Validity,
  Voucher,
  VoucherDraft,
} from '@/api-client';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { normalizeVoucherCode } from '../fixtures/build-voucher';
import { BillingProblem } from './billing-problem';
import { addMonthsClamped } from './license-invoice-preview';

/**
 * The rules of the vouchers the Core API applies, as pure functions
 * (api/internal/modules/vouchers/catalogue): what a draft must satisfy, whether a
 * voucher can be redeemed now and by an instance, and when a redemption ends. They
 * throw the refusals the API gives, with its codes and in its order, so that the
 * console is exercised against the reasons it will really be shown.
 */

const CODE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DECIMAL = /^\d+(\.\d+)?$/;

/** What a draft names that has to exist in the organization. */
export type VoucherReferences = {
  /** The type of an entitlement of the organization, or nothing when it has none by that slug. */
  entitlementType(slug: string): string | undefined;
  hasAddon(id: string): boolean;
  hasAddonPrice(id: string): boolean;
  hasCustomer(slug: string): boolean;
  hasLicense(id: string): boolean;
  hasLicensePrice(id: string): boolean;
};

const unprocessable = (operation: string, code: string, detail: string) =>
  new BillingProblem(422, `${operation}.${code}`, detail);

const notFound = (operation: string, code: string, detail: string) =>
  new BillingProblem(404, `${operation}.${code}`, detail);

function checkDiscount(draft: VoucherDraft, operation: string) {
  if (
    draft.priceDiscountType === undefined ||
    draft.priceDiscountValue === undefined ||
    draft.priceAppliesTo === undefined
  ) {
    throw unprocessable(
      operation,
      'InvalidDiscount',
      'a PRICE voucher names priceDiscountType, priceDiscountValue and priceAppliesTo',
    );
  }
  const value = DECIMAL.test(draft.priceDiscountValue)
    ? Number(draft.priceDiscountValue)
    : Number.NaN;
  if (!(value > 0)) {
    throw unprocessable(
      operation,
      'InvalidDiscount',
      'priceDiscountValue is a positive decimal',
    );
  }
  if (draft.priceDiscountType === 'PERCENTAGE') {
    if (value > 100) {
      throw unprocessable(
        operation,
        'InvalidDiscount',
        'a percentage is at most 100',
      );
    }
    if (draft.currency !== undefined) {
      throw unprocessable(
        operation,
        'InvalidCurrency',
        'a percentage has no currency',
      );
    }
  } else {
    if (!Number.isInteger(value)) {
      throw unprocessable(
        operation,
        'InvalidDiscount',
        'a fixed amount is an integer number of minor units',
      );
    }
    if (draft.currency === undefined) {
      throw unprocessable(
        operation,
        'CurrencyRequired',
        'a fixed amount names its currency',
      );
    }
    if (!CURRENCY_EXPONENTS.has(draft.currency)) {
      throw unprocessable(
        operation,
        'InvalidCurrency',
        'currency is an upper-case ISO 4217 code',
      );
    }
  }
  const selected =
    (draft.applicableLicensePriceIds?.length ?? 0) +
      (draft.applicableAddonPriceIds?.length ?? 0) >
    0;
  if ((draft.priceAppliesTo === 'SELECTED_PRICES') !== selected) {
    throw unprocessable(
      operation,
      'SelectedPricesRequired',
      'SELECTED_PRICES names the prices it discounts, and only it does',
    );
  }
}

function checkGrant(grant: Grant, operation: string) {
  const invalid = unprocessable(
    operation,
    'InvalidGrant',
    'modifierValue is >= 0 for SET, > 0 for ADD and MULTIPLY, and absent for UNLIMITED',
  );
  if (grant.modifierType === 'UNLIMITED') {
    if (grant.modifierValue !== undefined) {
      throw invalid;
    }

    return;
  }
  if (grant.modifierValue === undefined) {
    throw invalid;
  }
  const value = DECIMAL.test(grant.modifierValue)
    ? Number(grant.modifierValue)
    : Number.NaN;
  if (Number.isNaN(value) || (grant.modifierType !== 'SET' && value === 0)) {
    throw invalid;
  }
}

function checkBoost(
  draft: VoucherDraft,
  operation: string,
  references: VoucherReferences,
) {
  if (
    draft.priceDiscountType !== undefined ||
    draft.priceDiscountValue !== undefined ||
    draft.currency !== undefined ||
    draft.priceAppliesTo !== undefined ||
    (draft.applicableLicensePriceIds?.length ?? 0) > 0 ||
    (draft.applicableAddonPriceIds?.length ?? 0) > 0
  ) {
    throw unprocessable(
      operation,
      'InvalidDiscount',
      'an ENTITLEMENT_BOOST discounts nothing: omit the price members',
    );
  }
  if (!draft.grants?.length) {
    throw unprocessable(
      operation,
      'GrantsRequired',
      'an ENTITLEMENT_BOOST names at least one grant',
    );
  }
  for (const grant of draft.grants) {
    const type = references.entitlementType(grant.entitlementSlug);
    if (type === undefined) {
      throw notFound(
        operation,
        'EntitlementNotFound',
        `entitlement "${grant.entitlementSlug}" not found`,
      );
    }
    if (type !== 'NUMBER' && type !== 'NUMBER_AI_CREDIT') {
      throw unprocessable(
        operation,
        'BoostUnsupportedEntitlementType',
        'a boost changes a NUMBER or NUMBER_AI_CREDIT entitlement only',
      );
    }
    checkGrant(grant, operation);
  }
}

function checkReferences(
  draft: VoucherDraft,
  operation: string,
  references: VoucherReferences,
) {
  const missing = (
    ids: string[] | null | undefined,
    has: (id: string) => boolean,
  ) => (ids ?? []).some((id) => !has(id));

  if (draft.voucherType === 'PRICE') {
    if (missing(draft.applicableLicensePriceIds, references.hasLicensePrice)) {
      throw notFound(
        operation,
        'PriceNotFound',
        'a selected price does not exist',
      );
    }
    if (missing(draft.applicableAddonPriceIds, references.hasAddonPrice)) {
      throw notFound(
        operation,
        'PriceNotFound',
        'a selected add-on price does not exist',
      );
    }
  }
  // The ids restrict the voucher and address nothing: one that is not a version of
  // the organization is a refusal of the body, not a missing resource.
  if (missing(draft.applicableLicenseIds, references.hasLicense)) {
    throw unprocessable(
      operation,
      'InvalidApplicability',
      'an applicable licence id is not a licence version of the organization',
    );
  }
  if (missing(draft.applicableAddonIds, references.hasAddon)) {
    throw unprocessable(
      operation,
      'InvalidApplicability',
      'an applicable add-on id is not an add-on version of the organization',
    );
  }
  if (
    draft.restrictedCustomerSlug !== undefined &&
    !references.hasCustomer(draft.restrictedCustomerSlug)
  ) {
    throw notFound(
      operation,
      'CustomerNotFound',
      `customer "${draft.restrictedCustomerSlug}" not found`,
    );
  }
}

/**
 * The checks of a create or an update of a draft, in the order the API makes them.
 * The code is returned as given: the caller generates one when there is none.
 */
export function checkDraft(
  draft: VoucherDraft,
  operation: 'CreateVoucher' | 'UpdateVoucher',
  references: VoucherReferences,
) {
  if (draft.code !== undefined) {
    if (!CODE_PATTERN.test(draft.code)) {
      throw unprocessable(
        operation,
        'InvalidCode',
        'a code is 8 to 64 of A-Z, a-z, 0-9, _ and -',
      );
    }
    // The floor counts the normalized code: SUM-MER-27 is 8 characters.
    if (
      normalizeVoucherCode(draft.code).length < 12 &&
      draft.maxRedemptions === undefined &&
      draft.expiresAt === undefined
    ) {
      throw unprocessable(
        operation,
        'WeakCodeUnbounded',
        'a code shorter than 12 characters can be guessed: bound it with maxRedemptions or expiresAt',
      );
    }
  }
  if (
    draft.voucherType !== 'PRICE' &&
    draft.voucherType !== 'ENTITLEMENT_BOOST'
  ) {
    throw unprocessable(
      operation,
      'UnsupportedType',
      'a voucher is PRICE or ENTITLEMENT_BOOST',
    );
  }
  if (
    (draft.duration === 'REPEATING') !==
      (draft.durationInPeriods !== undefined) ||
    (draft.durationInPeriods !== undefined && draft.durationInPeriods < 1)
  ) {
    throw unprocessable(
      operation,
      'InvalidDuration',
      'durationInPeriods, at least 1, goes with REPEATING and only with it',
    );
  }
  if (
    draft.startsAt !== undefined &&
    draft.expiresAt !== undefined &&
    Date.parse(draft.startsAt) >= Date.parse(draft.expiresAt)
  ) {
    throw unprocessable(
      operation,
      'InvalidWindow',
      'startsAt is before expiresAt',
    );
  }
  const minimum = draft.redemptionRules?.minimumSubscriptionAmount;
  if (minimum !== undefined) {
    if (!CURRENCY_EXPONENTS.has(minimum.currency)) {
      throw unprocessable(
        operation,
        'InvalidRedemptionRules',
        'minimumSubscriptionAmount.currency is an upper-case ISO 4217 code',
      );
    }
    if (!DECIMAL.test(minimum.unitAmountDecimal)) {
      throw unprocessable(
        operation,
        'InvalidRedemptionRules',
        'minimumSubscriptionAmount.unitAmountDecimal is a non-negative decimal in minor units',
      );
    }
  }
  if (draft.voucherType === 'PRICE') {
    if ((draft.grants?.length ?? 0) > 0) {
      throw unprocessable(
        operation,
        'InvalidDiscount',
        'a PRICE voucher grants nothing: omit grants',
      );
    }
    checkDiscount(draft, operation);
  } else {
    checkBoost(draft, operation, references);
  }
  checkReferences(draft, operation, references);
}

/** One grant per entitlement: the API refuses a second as it writes the grants. */
export function checkDuplicateGrants(
  grants: readonly Grant[] | null | undefined,
  operation: string,
) {
  const seen = new Set<string>();
  for (const { entitlementSlug } of grants ?? []) {
    if (seen.has(entitlementSlug)) {
      throw unprocessable(
        operation,
        'DuplicateGrant',
        'one grant per entitlement',
      );
    }
    seen.add(entitlementSlug);
  }
}

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && b.every((id) => a.includes(id));
}

/**
 * Whether a draft changes nothing an ACTIVE voucher keeps: its code, discount,
 * applicability, grants, rules, duration and start. The API compares the grants by
 * entitlement, modifier and value, the values as numbers (`"3"` and `"3.0"` are one),
 * and the rules by their two flags and their minimum amount, which is why an update
 * restates all of them as they stand.
 */
export function onlyActiveMembersChange(
  stored: Voucher,
  draft: VoucherDraft,
): boolean {
  const same = <T>(a: T | undefined, b: T | undefined) => a === b;
  const sameTime = (a?: string, b?: string) =>
    (a === undefined && b === undefined) ||
    (a !== undefined && b !== undefined && Date.parse(a) === Date.parse(b));
  const sameDecimal = (a?: string, b?: string) =>
    a === undefined || b === undefined ? a === b : Number(a) === Number(b);
  const sameMinimum = (
    a: Voucher['redemptionRules']['minimumSubscriptionAmount'],
    b: NonNullable<
      VoucherDraft['redemptionRules']
    >['minimumSubscriptionAmount'],
  ) =>
    a === undefined || b === undefined
      ? a === b
      : a.currency === b.currency &&
        sameDecimal(a.unitAmountDecimal, b.unitAmountDecimal);
  const grants = draft.grants ?? [];

  return (
    stored.grants.length === grants.length &&
    grants.every((grant) =>
      stored.grants.some(
        (held) =>
          held.entitlementSlug === grant.entitlementSlug &&
          held.modifierType === grant.modifierType &&
          sameDecimal(held.modifierValue, grant.modifierValue),
      ),
    ) &&
    same(stored.code, draft.code) &&
    stored.duration === draft.duration &&
    same(stored.durationInPeriods, draft.durationInPeriods) &&
    sameTime(stored.startsAt, draft.startsAt) &&
    same(stored.priceDiscountType, draft.priceDiscountType) &&
    same(stored.priceDiscountValue, draft.priceDiscountValue) &&
    same(stored.currency, draft.currency) &&
    same(stored.priceAppliesTo, draft.priceAppliesTo) &&
    same(stored.restrictedCustomerSlug, draft.restrictedCustomerSlug) &&
    sameIds(
      stored.applicableLicensePriceIds,
      draft.applicableLicensePriceIds ?? [],
    ) &&
    sameIds(
      stored.applicableAddonPriceIds,
      draft.applicableAddonPriceIds ?? [],
    ) &&
    sameIds(stored.applicableLicenseIds, draft.applicableLicenseIds ?? []) &&
    sameIds(stored.applicableAddonIds, draft.applicableAddonIds ?? []) &&
    Boolean(stored.redemptionRules.firstTimeOnly) ===
      Boolean(draft.redemptionRules?.firstTimeOnly) &&
    Boolean(stored.redemptionRules.annualOnly) ===
      Boolean(draft.redemptionRules?.annualOnly) &&
    sameMinimum(
      stored.redemptionRules.minimumSubscriptionAmount,
      draft.redemptionRules?.minimumSubscriptionAmount,
    )
  );
}

// --- Redeeming -------------------------------------------------------------------

export type Refusal = {
  reason: NonNullable<Validity['reason']>;
  rule?: NonNullable<Validity['rule']>;
};

/**
 * The checks of the voucher itself at `now`, in the order the API makes them: exhausted,
 * then expired, then not active, then not yet started. It tests exhaustion and expiry
 * before the status, so that an archived voucher at its maximum is exhausted.
 */
export function windowRefusal(
  voucher: Voucher,
  now: number,
): Refusal | undefined {
  if (
    voucher.status === 'EXHAUSTED' ||
    (voucher.maxRedemptions !== undefined &&
      voucher.redemptionsCount >= voucher.maxRedemptions)
  ) {
    return { reason: 'EXHAUSTED' };
  }
  if (
    voucher.status === 'EXPIRED' ||
    (voucher.expiresAt !== undefined && Date.parse(voucher.expiresAt) <= now)
  ) {
    return { reason: 'EXPIRED' };
  }
  if (voucher.status !== 'ACTIVE') {
    return { reason: 'NOT_ACTIVE' };
  }
  if (voucher.startsAt !== undefined && Date.parse(voucher.startsAt) > now) {
    return { reason: 'NOT_YET_VALID' };
  }

  return undefined;
}

/** What the instance redeeming is, for the checks that need it. */
export type RedeemingInstance = {
  /** The add-on versions it holds. */
  addonIds: readonly string[];
  customerSlug: string;
  /** Whether any instance of its customer has paid an invoice. */
  customerHasPaid: boolean;
  /** The entitlements it has, whatever their type: none known means every one. */
  entitlementSlugs?: readonly string[];
  licenseId: string;
  /** Its subscription when it lives, or the one a price would start. */
  subscription?: PlannedSubscription;
};

/**
 * The checks that need the redeeming instance, in the order the API makes them. The
 * entitlements a boost changes are looked up by `entitlementTypeOf`.
 */
export function instanceRefusal(
  voucher: Voucher,
  instance: RedeemingInstance,
  redeemedAlready: boolean,
  entitlementTypeOf: (slug: string) => string | undefined,
): Refusal | undefined {
  const notEligible = (rule: NonNullable<Validity['rule']>): Refusal => ({
    reason: 'NOT_ELIGIBLE',
    rule,
  });
  const { subscription } = instance;

  if (
    voucher.restrictedCustomerSlug !== undefined &&
    voucher.restrictedCustomerSlug !== instance.customerSlug
  ) {
    return notEligible('RESTRICTED_CUSTOMER');
  }
  if (
    voucher.applicableLicenseIds.length > 0 &&
    !voucher.applicableLicenseIds.includes(instance.licenseId)
  ) {
    return notEligible('LICENSE_NOT_APPLICABLE');
  }
  if (
    voucher.applicableAddonIds.length > 0 &&
    !voucher.applicableAddonIds.some((id) => instance.addonIds.includes(id))
  ) {
    return notEligible('ADDON_NOT_APPLICABLE');
  }
  const rules = voucher.redemptionRules;
  if (rules.firstTimeOnly && instance.customerHasPaid) {
    return notEligible('FIRST_TIME_ONLY');
  }
  if (
    rules.annualOnly &&
    (!subscription || subscription.billingPeriod !== 'ANNUAL')
  ) {
    return notEligible('ANNUAL_ONLY');
  }
  const minimum = rules.minimumSubscriptionAmount;
  if (
    minimum &&
    (!subscription ||
      subscription.basePrice.currency !== minimum.currency ||
      Number(subscription.basePrice.unitAmountDecimal) <
        Number(minimum.unitAmountDecimal))
  ) {
    return notEligible('MINIMUM_SUBSCRIPTION_AMOUNT');
  }
  if (
    subscription &&
    voucher.priceDiscountType === 'FIXED_AMOUNT' &&
    voucher.currency !== subscription.currency
  ) {
    return { reason: 'CURRENCY_MISMATCH' };
  }
  if (
    voucher.voucherType === 'ENTITLEMENT_BOOST' &&
    !voucher.grants.some((grant) => {
      const type = entitlementTypeOf(grant.entitlementSlug);

      return (
        (type === 'NUMBER' || type === 'NUMBER_AI_CREDIT') &&
        (instance.entitlementSlugs === undefined ||
          instance.entitlementSlugs.includes(grant.entitlementSlug))
      );
    })
  ) {
    return notEligible('NOTHING_TO_BOOST');
  }
  if (redeemedAlready) {
    return { reason: 'ALREADY_REDEEMED' };
  }

  return undefined;
}

/**
 * The subscription a flat-fee price would start, as the checks read it: the period, the
 * amount and the currency of the price, and the version it belongs to. A validation that
 * names a price reads this in place of the subscription the instance has.
 */
export type PlannedSubscription = Pick<
  InstanceBilling,
  'basePrice' | 'billingPeriod' | 'currency'
>;

/**
 * The refusal the API gives a principal that checks more than sixty codes in a minute
 * (`POST /vouchers/validate`, 429), for a spec to arm on the validation: the words and the
 * code are the API's, and it names no `Retry-After` the browser could read.
 */
export const VALIDATION_RATE_LIMITED = {
  code: 'ValidateVoucher.RateLimited',
  detail: 'too many voucher codes checked: try again later',
  status: 429,
} as const;

/** The refusal of a redeem for a failed check, with the code and the words of the API. */
export function redeemProblem(
  refusal: Refusal,
  operation: string,
): BillingProblem {
  switch (refusal.reason) {
    case 'NOT_FOUND':
      return new BillingProblem(
        404,
        `${operation}.NotFound`,
        'no voucher has this code',
      );
    case 'NOT_ACTIVE':
      return unprocessable(operation, 'NotActive', 'the voucher is not active');
    case 'NOT_YET_VALID':
      return unprocessable(
        operation,
        'NotYetValid',
        'the voucher cannot be redeemed yet',
      );
    case 'EXPIRED':
      return unprocessable(operation, 'Expired', 'the voucher has expired');
    case 'EXHAUSTED':
      return unprocessable(
        operation,
        'Exhausted',
        'the voucher has been redeemed as many times as it can be',
      );
    case 'CURRENCY_MISMATCH':
      return unprocessable(
        operation,
        'CurrencyMismatch',
        "the voucher's amount is in another currency than the subscription's",
      );
    case 'ALREADY_REDEEMED':
      return new BillingProblem(
        409,
        `${operation}.AlreadyRedeemed`,
        'the instance already redeemed this voucher',
      );
    case 'NOT_ELIGIBLE':
      return new BillingProblem(
        422,
        `${operation}.NotEligible`,
        'the instance is not eligible for this voucher',
        {
          errors: [
            {
              location: 'rule',
              message: 'eligibility rule',
              value: { rule: refusal.rule },
            },
          ],
        },
      );
  }
}

// --- What a redemption lasts --------------------------------------------------------

const PERIOD_MONTHS = {
  ANNUAL: 12,
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
} as const;

/** How many invoices a PRICE voucher discounts: nothing for FOREVER. */
export function applicationsMaxOf(voucher: Voucher): number | undefined {
  if (voucher.duration === 'ONE_TIME') {
    return 1;
  }

  return voucher.duration === 'REPEATING'
    ? voucher.durationInPeriods
    : undefined;
}

/**
 * When a boost redeemed at `redeemedAt` stops applying: its duration in the billing
 * periods of the live subscription, a calendar month without one. Never for FOREVER,
 * and never for a PRICE voucher, which is counted in invoices.
 */
export function boostEnd(
  voucher: Voucher,
  redeemedAt: Date,
  subscription: Pick<InstanceBilling, 'billingPeriod'> | undefined,
): string | undefined {
  if (
    voucher.voucherType !== 'ENTITLEMENT_BOOST' ||
    voucher.duration === 'FOREVER'
  ) {
    return undefined;
  }
  const months = subscription ? PERIOD_MONTHS[subscription.billingPeriod] : 1;
  const periods =
    voucher.duration === 'REPEATING' ? (voucher.durationInPeriods ?? 1) : 1;

  return addMonthsClamped(redeemedAt, months * periods).toISOString();
}

/** The redemption a boost makes of an entitlement at `now`: in force when active and inside its window. */
export function isInForce(redemption: Redemption, now: number): boolean {
  return (
    redemption.status === 'ACTIVE' &&
    Date.parse(redemption.effectiveStartsAt) <= now &&
    (redemption.effectiveExpiresAt === null ||
      now < Date.parse(redemption.effectiveExpiresAt))
  );
}

/** A code as the API shows it of a voucher: matched without case or separators. */
export const sameCode = (a: string, b: string): boolean =>
  normalizeVoucherCode(a) === normalizeVoucherCode(b);
