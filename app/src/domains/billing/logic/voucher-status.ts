import type { Redemption, Voucher } from '@/api-client';

/** The state a voucher is shown in (`Voucher.status`). */
export type VoucherStatus = Voucher['status'];

export const VOUCHER_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'EXPIRED',
  'EXHAUSTED',
  'ARCHIVED',
] as const satisfies readonly VoucherStatus[];

const VOUCHER_STATUS_LABEL_KEYS = {
  ACTIVE: 'Features.Billing.VoucherStatus.ACTIVE',
  ARCHIVED: 'Features.Billing.VoucherStatus.ARCHIVED',
  DRAFT: 'Features.Billing.VoucherStatus.DRAFT',
  EXHAUSTED: 'Features.Billing.VoucherStatus.EXHAUSTED',
  EXPIRED: 'Features.Billing.VoucherStatus.EXPIRED',
} as const satisfies Record<VoucherStatus, string>;

export const getVoucherStatusLabelKey = (status: VoucherStatus): string =>
  VOUCHER_STATUS_LABEL_KEYS[status];

/** What the status of a voucher is judged from. */
export type VoucherStatusInput = Pick<
  Voucher,
  'expiresAt' | 'maxRedemptions' | 'redemptionsCount' | 'status'
>;

const toTime = (now: Date | number) =>
  typeof now === 'number' ? now : now.getTime();

/**
 * The status to show for a voucher. The API never sets a voucher EXPIRED, and an
 * ACTIVE voucher stays ACTIVE past its window until the redemption that reaches its
 * maximum flips it to EXHAUSTED, so the status it stores is not what a person is
 * after. A voucher that is ACTIVE reads from its window and its count: fully redeemed
 * when its count reached its maximum (the API tests it first, as the redemption
 * does), expired when `expiresAt` is not after now. A draft and an archived voucher
 * keep theirs, and so does one the API itself marked as expired or exhausted.
 */
export function getVoucherStatus(
  voucher: VoucherStatusInput,
  now: Date | number = Date.now(),
): VoucherStatus {
  if (voucher.status !== 'ACTIVE') {
    return voucher.status;
  }
  if (
    voucher.maxRedemptions !== undefined &&
    voucher.redemptionsCount >= voucher.maxRedemptions
  ) {
    return 'EXHAUSTED';
  }
  if (voucher.expiresAt && Date.parse(voucher.expiresAt) <= toTime(now)) {
    return 'EXPIRED';
  }

  return 'ACTIVE';
}

/** Whether a voucher whose window starts after now is still to start: it is ACTIVE and cannot be redeemed yet. */
export function isVoucherScheduled(
  voucher: Pick<Voucher, 'startsAt'>,
  now: Date | number = Date.now(),
): boolean {
  return (
    voucher.startsAt !== undefined && Date.parse(voucher.startsAt) > toTime(now)
  );
}

/** The state of a redemption (`Redemption.status`). */
export type RedemptionStatus = Redemption['status'];

const REDEMPTION_STATUS_LABEL_KEYS = {
  ACTIVE: 'Features.Billing.RedemptionStatus.ACTIVE',
  EXPIRED: 'Features.Billing.RedemptionStatus.EXPIRED',
  REVOKED: 'Features.Billing.RedemptionStatus.REVOKED',
} as const satisfies Record<RedemptionStatus, string>;

export const getRedemptionStatusLabelKey = (status: RedemptionStatus): string =>
  REDEMPTION_STATUS_LABEL_KEYS[status];

/**
 * The status to show for a redemption. A boost redemption stays ACTIVE past its window,
 * the API having no sweep that ends it, though it has long stopped applying; it reads
 * as expired from its window. A discount redemption is ended by the invoice that uses
 * its last application, which the API records, and a revoked one stays revoked.
 */
export function getRedemptionStatus(
  redemption: Pick<Redemption, 'effectiveExpiresAt' | 'status'>,
  now: Date | number = Date.now(),
): RedemptionStatus {
  if (
    redemption.status === 'ACTIVE' &&
    redemption.effectiveExpiresAt &&
    Date.parse(redemption.effectiveExpiresAt) <= toTime(now)
  ) {
    return 'EXPIRED';
  }

  return redemption.status;
}

/** What a voucher is (`Voucher.voucherType`): V1 ships a discount on the invoices and a boost of an entitlement. */
export type VoucherType = Voucher['voucherType'];

export const VOUCHER_TYPES = [
  'PRICE',
  'ENTITLEMENT_BOOST',
] as const satisfies readonly VoucherType[];

const VOUCHER_TYPE_LABEL_KEYS = {
  ENTITLEMENT_BOOST: 'Features.Billing.VoucherType.ENTITLEMENT_BOOST',
  PRICE: 'Features.Billing.VoucherType.PRICE',
} as const satisfies Record<VoucherType, string>;

export const getVoucherTypeLabelKey = (type: VoucherType): string =>
  VOUCHER_TYPE_LABEL_KEYS[type];
