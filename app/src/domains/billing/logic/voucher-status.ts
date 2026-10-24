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

const toTime = (now: Date | number) =>
  typeof now === 'number' ? now : now.getTime();

/** Whether a voucher whose window starts after now is still to start: it is ACTIVE and cannot be redeemed yet. */
export function isVoucherScheduled(
  voucher: Pick<Voucher, 'startsAt'>,
  now: Date | number = Date.now(),
): boolean {
  return voucher.startsAt != null && Date.parse(voucher.startsAt) > toTime(now);
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
  FLAG_GRANT: 'Features.Billing.VoucherType.FLAG_GRANT',
  PRICE: 'Features.Billing.VoucherType.PRICE',
} as const satisfies Record<VoucherType, string>;

export const getVoucherTypeLabelKey = (type: VoucherType): string =>
  VOUCHER_TYPE_LABEL_KEYS[type];
