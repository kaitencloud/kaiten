import type {
  Grant,
  RedemptionRules,
  Voucher,
  VoucherDraft,
} from '@/api-client';
import {
  dateTimeInputToInstant,
  instantToDateTimeInput,
} from '@/lib/date-time-input';
import { majorToMinorDecimal, minorToMajorDecimal } from '@/lib/money';
import {
  initialVoucherFormValues,
  newGrant,
  readFixedAmount,
  readPercentage,
  type GrantFormValues,
  type VoucherFormValues,
} from './voucher.schema';

const toOptionalText = (text: string): string | undefined =>
  text.trim() === '' ? undefined : text.trim();

const toOptionalCount = (count: number): number | undefined =>
  Number.isNaN(count) ? undefined : count;

const toOptionalInstant = (text: string): string | undefined =>
  dateTimeInputToInstant(text) ?? undefined;

/**
 * The rules of eligibility of a body. This is the one place that knows the shape of the
 * minimum amount, which is provisional: today an object of a currency and an amount in
 * minor units (`unitAmountDecimal`), where the spec has an integer. A change of it
 * touches this function and `redemptionRulesToFormValues` and nothing else.
 */
export function redemptionRulesToBody(
  values: Pick<
    VoucherFormValues,
    'annualOnly' | 'firstTimeOnly' | 'minimumAmount' | 'minimumCurrency'
  >,
): RedemptionRules {
  const minimum = values.minimumAmount.trim();
  const unitAmountDecimal =
    minimum === '' || !values.minimumCurrency
      ? null
      : majorToMinorDecimal(minimum, values.minimumCurrency);

  return {
    ...(values.annualOnly ? { annualOnly: true } : {}),
    ...(values.firstTimeOnly ? { firstTimeOnly: true } : {}),
    ...(unitAmountDecimal === null
      ? {}
      : {
          minimumSubscriptionAmount: {
            currency: values.minimumCurrency,
            unitAmountDecimal,
          },
        }),
  };
}

/** What the form holds of the rules of a voucher: the counterpart of `redemptionRulesToBody`. */
export function redemptionRulesToFormValues(
  rules: RedemptionRules,
): Pick<
  VoucherFormValues,
  'annualOnly' | 'firstTimeOnly' | 'minimumAmount' | 'minimumCurrency'
> {
  const minimum = rules.minimumSubscriptionAmount;

  return {
    annualOnly: Boolean(rules.annualOnly),
    firstTimeOnly: Boolean(rules.firstTimeOnly),
    minimumAmount: minimum
      ? (minorToMajorDecimal(minimum.unitAmountDecimal, minimum.currency) ?? '')
      : '',
    minimumCurrency: minimum?.currency ?? '',
  };
}

function grantToBody(grant: GrantFormValues): Grant {
  return {
    entitlementSlug: grant.entitlementSlug,
    modifierType: grant.modifierType,
    ...(grant.modifierType === 'UNLIMITED'
      ? {}
      : { modifierValue: grant.modifierValue.trim().replace(',', '.') }),
  };
}

function priceMembers(values: VoucherFormValues): Partial<VoucherDraft> {
  const percentage = values.priceDiscountType === 'PERCENTAGE';
  const selected = values.priceAppliesTo === 'SELECTED_PRICES';

  return {
    applicableAddonPriceIds: selected ? values.applicableAddonPriceIds : [],
    applicableLicensePriceIds: selected ? values.applicableLicensePriceIds : [],
    currency: percentage ? undefined : values.currency,
    priceAppliesTo: values.priceAppliesTo,
    priceDiscountType: values.priceDiscountType,
    priceDiscountValue: percentage
      ? (readPercentage(values.percentage) ?? values.percentage.trim())
      : (readFixedAmount(values.amount, values.currency) ??
        values.amount.trim()),
  };
}

/**
 * The body of a new voucher, or of the replacement of a draft. Only the members of its
 * type are sent: a discount carries no grants, a boost no price. What was left empty is
 * left out, so that the API generates the code and applies no limit.
 */
export function voucherFormValuesToBody(
  values: VoucherFormValues,
): VoucherDraft {
  const boost = values.voucherType === 'ENTITLEMENT_BOOST';

  return {
    applicableAddonIds: values.applicableAddonIds,
    applicableLicenseIds: values.applicableLicenseIds,
    code: toOptionalText(values.code),
    description: toOptionalText(values.description),
    duration: values.duration,
    durationInPeriods:
      values.duration === 'REPEATING'
        ? toOptionalCount(values.durationInPeriods)
        : undefined,
    expiresAt: toOptionalInstant(values.expiresAt),
    grants: boost ? values.grants.map(grantToBody) : undefined,
    maxRedemptions: toOptionalCount(values.maxRedemptions),
    name: values.name.trim(),
    redemptionRules: redemptionRulesToBody(values),
    restrictedCustomerSlug: toOptionalText(values.restrictedCustomerSlug),
    startsAt: toOptionalInstant(values.startsAt),
    voucherType: values.voucherType,
    ...(boost ? {} : priceMembers(values)),
  };
}

/** The form of a voucher that already exists, to edit a draft in the wizard that made it. */
export function voucherToFormValues(voucher: Voucher): VoucherFormValues {
  const fixed = voucher.priceDiscountType === 'FIXED_AMOUNT';
  const currency = voucher.currency ?? '';

  return {
    ...initialVoucherFormValues,
    ...redemptionRulesToFormValues(voucher.redemptionRules),
    amount:
      fixed && voucher.priceDiscountValue
        ? (minorToMajorDecimal(voucher.priceDiscountValue, currency) ?? '')
        : '',
    applicableAddonIds: [...voucher.applicableAddonIds],
    applicableAddonPriceIds: [...voucher.applicableAddonPriceIds],
    applicableLicenseIds: [...voucher.applicableLicenseIds],
    applicableLicensePriceIds: [...voucher.applicableLicensePriceIds],
    code: voucher.code ?? '',
    currency,
    description: voucher.description ?? '',
    duration: voucher.duration,
    durationInPeriods: voucher.durationInPeriods ?? Number.NaN,
    expiresAt: instantToDateTimeInput(voucher.expiresAt),
    grants: voucher.grants.map((grant) => ({
      ...newGrant(),
      entitlementSlug: grant.entitlementSlug,
      modifierType: grant.modifierType,
      modifierValue: grant.modifierValue ?? '',
    })),
    maxRedemptions: voucher.maxRedemptions ?? Number.NaN,
    name: voucher.name,
    percentage: fixed ? '' : (voucher.priceDiscountValue ?? ''),
    priceAppliesTo: voucher.priceAppliesTo ?? 'LICENSE_BASE',
    priceDiscountType: voucher.priceDiscountType ?? 'PERCENTAGE',
    restrictedCustomerSlug: voucher.restrictedCustomerSlug ?? '',
    startsAt: instantToDateTimeInput(voucher.startsAt),
    voucherType: voucher.voucherType,
  };
}

/**
 * Where "add a boost for the same offer" starts: a boost with the duration, the
 * eligibility and the limits of the discount it follows, to be given the entitlements
 * it changes. The code is the API's to generate, and the name says what it follows.
 */
export function boostLikeToFormValues(
  discount: Voucher,
  name: string,
): VoucherFormValues {
  return {
    ...voucherToFormValues(discount),
    amount: '',
    applicableAddonPriceIds: [],
    applicableLicensePriceIds: [],
    code: '',
    currency: '',
    description: '',
    grants: [],
    name,
    percentage: '',
    priceAppliesTo: 'LICENSE_BASE',
    priceDiscountType: 'PERCENTAGE',
    voucherType: 'ENTITLEMENT_BOOST',
  };
}
