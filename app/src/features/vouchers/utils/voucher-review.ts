import type { TFunction } from 'i18next';
import type { VoucherDraft } from '@/api-client';
import { describeVoucherOffer, formatUtcDate } from '@/domains/billing';
import { formatMoney } from '@/lib/money';
import type { VoucherNames } from '../types';

/** What a voucher says of itself, beyond its offer: a stored voucher or the draft being made. */
export type VoucherReviewInput = Pick<
  VoucherDraft,
  | 'applicableAddonIds'
  | 'applicableAddonPriceIds'
  | 'applicableLicenseIds'
  | 'applicableLicensePriceIds'
  | 'duration'
  | 'durationInPeriods'
  | 'expiresAt'
  | 'grants'
  | 'maxRedemptions'
  | 'priceAppliesTo'
  | 'priceDiscountType'
  | 'priceDiscountValue'
  | 'currency'
  | 'redemptionRules'
  | 'restrictedCustomerSlug'
  | 'startsAt'
  | 'voucherType'
>;

type ReviewOptions = {
  language: string;
  names: VoucherNames;
  t: TFunction;
};

const join = (names: readonly string[], language: string) =>
  new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(
    names,
  );

/** The part of the review that names what the voucher is limited to, or nothing when it is not. */
function describeApplicability(
  voucher: VoucherReviewInput,
  { language, names, t }: ReviewOptions,
): string | null {
  const licenses = (voucher.applicableLicenseIds ?? []).map(
    (id) => names.licenses[id] ?? t('Pages.Vouchers.References.unknown'),
  );
  const addons = (voucher.applicableAddonIds ?? []).map(
    (id) => names.addons[id] ?? t('Pages.Vouchers.References.unknown'),
  );

  if (licenses.length > 0 && addons.length > 0) {
    return t('Pages.Vouchers.Review.licensesAndAddons', {
      addons: join(addons, language),
      licenses: join(licenses, language),
    });
  }
  if (licenses.length > 0) {
    return t('Pages.Vouchers.Review.licenses', {
      licenses: join(licenses, language),
    });
  }
  if (addons.length > 0) {
    return t('Pages.Vouchers.Review.addons', {
      addons: join(addons, language),
    });
  }

  return null;
}

/** The window the voucher can be redeemed in, in UTC, or nothing when it has none. */
function describeWindow(
  voucher: VoucherReviewInput,
  { language, t }: ReviewOptions,
): string | null {
  if (voucher.startsAt && voucher.expiresAt) {
    return t('Pages.Vouchers.Review.window', {
      from: formatUtcDate(voucher.startsAt, language),
      to: formatUtcDate(voucher.expiresAt, language),
    });
  }
  if (voucher.expiresAt) {
    return t('Pages.Vouchers.Review.until', {
      date: formatUtcDate(voucher.expiresAt, language),
    });
  }
  if (voucher.startsAt) {
    return t('Pages.Vouchers.Review.from', {
      date: formatUtcDate(voucher.startsAt, language),
    });
  }

  return null;
}

function describeRules(
  voucher: VoucherReviewInput,
  { language, t }: ReviewOptions,
): string[] {
  const rules = voucher.redemptionRules;
  const minimum = rules?.minimumSubscriptionAmount;

  return [
    rules?.firstTimeOnly ? t('Pages.Vouchers.Review.firstTimeOnly') : null,
    rules?.annualOnly ? t('Pages.Vouchers.Review.annualOnly') : null,
    minimum && /^\d+$/.test(minimum.unitAmountDecimal)
      ? t('Pages.Vouchers.Review.minimumAmount', {
          amount: formatMoney(
            minimum.currency,
            BigInt(minimum.unitAmountDecimal),
            language,
          ),
        })
      : null,
  ].filter((sentence): sentence is string => sentence !== null);
}

/**
 * The voucher in plain language, one sentence a line, as the account executive pastes
 * it in the e-mail that goes with the code: what it does, for how long, how many times
 * it can be redeemed, for whom, until when and under which conditions. Each sentence
 * names what it counts, since a discount lasts in invoices and a boost in billing
 * periods, which diverge after a plan change.
 */
export function describeVoucherReview(
  voucher: VoucherReviewInput,
  options: ReviewOptions,
): string[] {
  const { names, t } = options;
  const customer = voucher.restrictedCustomerSlug
    ? (names.customers[voucher.restrictedCustomerSlug] ??
      voucher.restrictedCustomerSlug)
    : null;

  return [
    describeVoucherOffer(voucher, {
      entitlementNames: names.entitlements,
      language: options.language,
      t,
    }),
    voucher.maxRedemptions === undefined
      ? t('Pages.Vouchers.Review.unlimited')
      : t('Pages.Vouchers.Review.limited', { count: voucher.maxRedemptions }),
    customer
      ? t('Pages.Vouchers.Review.reservedFor', { customer })
      : t('Pages.Vouchers.Review.anyCustomer'),
    describeApplicability(voucher, options),
    describeWindow(voucher, options) ?? t('Pages.Vouchers.Review.noWindow'),
    ...describeRules(voucher, options),
  ]
    .filter((sentence): sentence is string => sentence !== null)
    .map((sentence) => sentence.replace(/[.\s]+$/, ''))
    .map(
      (sentence) => `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`,
    );
}
