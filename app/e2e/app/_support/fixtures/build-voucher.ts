import type { Grant, Redemption, RedemptionRules, Voucher } from '@/api-client';

const CREATED_AT = '2026-03-01T09:00:00.000Z';

/** A code with everything but letters and digits dropped, in upper case: the way the API matches a code. */
export const normalizeVoucherCode = (code: string): string =>
  code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** The last four characters of the normalized code: what the API shows of it where the code is secret. */
export const voucherCodeHint = (code: string): string =>
  normalizeVoucherCode(code).slice(-4);

/**
 * Build a voucher, as the API answers it a caller who may read vouchers: with its code.
 * A PRICE voucher is 20 % off the base price of one invoice unless it says otherwise,
 * and a boost names its grants.
 */
export function buildVoucher({
  applicableAddonIds = [],
  applicableAddonPriceIds = [],
  applicableLicenseIds = [],
  applicableLicensePriceIds = [],
  code,
  createdAt = CREATED_AT,
  currency,
  description,
  duration = 'ONE_TIME',
  durationInPeriods,
  expiresAt,
  grants = [],
  id,
  maxRedemptions,
  name,
  priceAppliesTo,
  priceDiscountType,
  priceDiscountValue,
  redemptionRules = {},
  redemptionsCount = 0,
  restrictedCustomerSlug,
  startsAt,
  status = 'ACTIVE',
  updatedAt,
  voucherType = 'PRICE',
}: {
  applicableAddonIds?: string[];
  applicableAddonPriceIds?: string[];
  applicableLicenseIds?: string[];
  applicableLicensePriceIds?: string[];
  code: string;
  createdAt?: string;
  currency?: string;
  description?: string;
  duration?: Voucher['duration'];
  durationInPeriods?: number;
  expiresAt?: string;
  grants?: Grant[];
  id: string;
  maxRedemptions?: number;
  name: string;
  priceAppliesTo?: Voucher['priceAppliesTo'];
  priceDiscountType?: Voucher['priceDiscountType'];
  /** A percentage in (0, 100], or an integer amount in minor units. */
  priceDiscountValue?: string;
  redemptionRules?: RedemptionRules;
  redemptionsCount?: number;
  restrictedCustomerSlug?: string;
  startsAt?: string;
  status?: Voucher['status'];
  updatedAt?: string;
  voucherType?: Voucher['voucherType'];
}): Voucher {
  const isPrice = voucherType === 'PRICE';

  return {
    applicableAddonIds,
    applicableAddonPriceIds,
    applicableLicenseIds,
    applicableLicensePriceIds,
    code,
    codeHint: voucherCodeHint(code),
    createdAt,
    currency: isPrice ? currency : undefined,
    description,
    duration,
    durationInPeriods,
    expiresAt,
    grants: isPrice ? [] : grants,
    id,
    maxRedemptions,
    name,
    priceAppliesTo: isPrice ? (priceAppliesTo ?? 'LICENSE_BASE') : undefined,
    priceDiscountType: isPrice
      ? (priceDiscountType ?? (currency ? 'FIXED_AMOUNT' : 'PERCENTAGE'))
      : undefined,
    priceDiscountValue: isPrice ? (priceDiscountValue ?? '20') : undefined,
    redemptionRules,
    redemptionsCount,
    restrictedCustomerSlug,
    startsAt,
    status,
    updatedAt: updatedAt ?? createdAt,
    voucherType,
  };
}

/**
 * Build what an instance redeemed of a voucher, as the API answers it: the voucher by
 * its name and the last four characters of its code, never the code. A PRICE redemption
 * counts the invoices it discounted; a boost has the window it applies in.
 */
export function buildRedemption({
  applicationsCount = 0,
  applicationsMax,
  effectiveExpiresAt,
  effectiveStartsAt,
  expiredAt,
  id,
  instanceSlug,
  redeemedAt = CREATED_AT,
  revokedAt,
  revokedReason,
  status = 'ACTIVE',
  voucher,
}: {
  applicationsCount?: number;
  applicationsMax?: number;
  effectiveExpiresAt?: string;
  effectiveStartsAt?: string;
  expiredAt?: string;
  id: string;
  instanceSlug: string;
  redeemedAt?: string;
  revokedAt?: string;
  revokedReason?: string;
  status?: Redemption['status'];
  voucher: Pick<Voucher, 'codeHint' | 'id' | 'name' | 'voucherType'>;
}): Redemption {
  return {
    applicationsCount,
    applicationsMax,
    codeHint: voucher.codeHint,
    effectiveExpiresAt,
    effectiveStartsAt: effectiveStartsAt ?? redeemedAt,
    expiredAt,
    id,
    instanceSlug,
    redeemedAt,
    revokedAt,
    revokedReason,
    status,
    voucherId: voucher.id,
    voucherName: voucher.name,
    voucherType: voucher.voucherType,
  };
}
