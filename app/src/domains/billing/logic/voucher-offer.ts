import type { TFunction } from 'i18next';
import type { Grant, Voucher } from '@/api-client';
import { getAppLocale } from '@/lib/app-locale';
import { formatNumber } from '@/lib/format-date';
import { formatMoney } from '@/lib/money';

/**
 * What a voucher does, in the words of a person: the discount and what it applies to,
 * or what it changes of which entitlement, and for how long, naming the unit each
 * duration counts, since they diverge after a plan change: a discount is counted in
 * invoices, a boost in billing periods. It is the sentence an account executive
 * pastes in the e-mail that goes with the code, so it reads from a voucher already
 * made as well as from the one being drafted.
 */
export type VoucherOfferInput = {
  applicableAddonPriceIds?: readonly string[] | null;
  applicableLicensePriceIds?: readonly string[] | null;
  currency?: string;
  duration: Voucher['duration'];
  durationInPeriods?: number;
  grants?: readonly Grant[] | null;
  priceAppliesTo?: Voucher['priceAppliesTo'];
  priceDiscountType?: Voucher['priceDiscountType'];
  priceDiscountValue?: string;
  voucherType: Voucher['voucherType'];
};

type OfferOptions = {
  /** The names of the entitlements by slug; a slug without a name is written as it is. */
  entitlementNames?: Readonly<Record<string, string>>;
  language?: string;
  t: TFunction;
};

const PERCENT_DIGITS = 4;

/** The discount of a voucher as it is written: `30%`, or `$50.00` for an amount in minor units. */
export function describeDiscount(
  voucher: Pick<
    VoucherOfferInput,
    'currency' | 'priceDiscountType' | 'priceDiscountValue'
  >,
  language: string = getAppLocale(),
): string {
  const value = voucher.priceDiscountValue ?? '';

  if (voucher.priceDiscountType === 'FIXED_AMOUNT' && voucher.currency) {
    return /^\d+$/.test(value)
      ? formatMoney(voucher.currency, BigInt(value), language)
      : `${value} ${voucher.currency}`;
  }
  const percentage = Number(value);

  return Number.isNaN(percentage)
    ? value
    : new Intl.NumberFormat(language, {
        maximumFractionDigits: PERCENT_DIGITS,
        style: 'percent',
      }).format(percentage / 100);
}

function describeTarget(voucher: VoucherOfferInput, t: TFunction): string {
  const appliesTo = voucher.priceAppliesTo ?? 'LICENSE_BASE';

  if (appliesTo === 'SELECTED_PRICES') {
    return t('Features.Billing.Voucher.Offer.Target.SELECTED_PRICES', {
      count:
        (voucher.applicableLicensePriceIds?.length ?? 0) +
        (voucher.applicableAddonPriceIds?.length ?? 0),
    });
  }

  return t(`Features.Billing.Voucher.Offer.Target.${appliesTo}`);
}

function describePriceDuration(
  voucher: VoucherOfferInput,
  t: TFunction,
): string {
  switch (voucher.duration) {
    case 'ONE_TIME':
      return t('Features.Billing.Voucher.Offer.PriceDuration.ONE_TIME');
    case 'REPEATING':
      return t('Features.Billing.Voucher.Offer.PriceDuration.REPEATING', {
        count: voucher.durationInPeriods ?? 1,
      });
    case 'FOREVER':
      return t('Features.Billing.Voucher.Offer.PriceDuration.FOREVER');
  }
}

function describeBoostDuration(
  voucher: VoucherOfferInput,
  t: TFunction,
): string {
  switch (voucher.duration) {
    case 'ONE_TIME':
      return t('Features.Billing.Voucher.Offer.BoostDuration.ONE_TIME');
    case 'REPEATING':
      return t('Features.Billing.Voucher.Offer.BoostDuration.REPEATING', {
        count: voucher.durationInPeriods ?? 1,
      });
    case 'FOREVER':
      return t('Features.Billing.Voucher.Offer.BoostDuration.FOREVER');
  }
}

/** One grant of a boost: `Tokens × 2`, `API calls + 5,000`, `Seats set to 10`, `Storage unlimited`. */
export function describeGrant(
  grant: Grant,
  { entitlementNames, t }: Pick<OfferOptions, 'entitlementNames' | 't'>,
): string {
  const value = grant.modifierValue ?? '';
  const number = Number(value);

  return t(`Features.Billing.Voucher.Offer.Change.${grant.modifierType}`, {
    entitlement:
      entitlementNames?.[grant.entitlementSlug] ?? grant.entitlementSlug,
    value: Number.isNaN(number)
      ? value
      : formatNumber(number, { maximumFractionDigits: 6 }),
  });
}

/** What the voucher does, as one sentence without its final stop. */
export function describeVoucherOffer(
  voucher: VoucherOfferInput,
  options: OfferOptions,
): string {
  const { language, t } = options;

  if (voucher.voucherType === 'ENTITLEMENT_BOOST') {
    return t('Features.Billing.Voucher.Offer.boost', {
      changes: (voucher.grants ?? [])
        .map((grant) => describeGrant(grant, options))
        .join(', '),
      duration: describeBoostDuration(voucher, t),
    });
  }

  return t('Features.Billing.Voucher.Offer.price', {
    discount: describeDiscount(voucher, language),
    duration: describePriceDuration(voucher, t),
    target: describeTarget(voucher, t),
  });
}
