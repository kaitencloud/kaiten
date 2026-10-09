import type { EntitlementUsage, InvoicePreview, Voucher } from '@/api-client';
import {
  buildRedemption,
  buildVoucher,
} from '../../../../../../../../../e2e/app/_support/fixtures';

/** What the vouchers of the Billing tab are tested on: a boost of storage, a discount, and what an instance redeemed of them. */
export const STORAGE_BOOST: Voucher = buildVoucher({
  code: 'STORAGE-BOOST-50',
  duration: 'REPEATING',
  durationInPeriods: 2,
  grants: [
    { entitlementSlug: 'storage-gb', modifierType: 'ADD', modifierValue: '50' },
  ],
  id: 'voucher-storage',
  name: 'Storage boost',
  voucherType: 'ENTITLEMENT_BOOST',
});
export const WELCOME: Voucher = buildVoucher({
  code: 'WELCOME-SPRING-2027',
  duration: 'REPEATING',
  durationInPeriods: 3,
  id: 'voucher-welcome',
  name: 'Welcome spring',
});

export const BOOST_REDEMPTION = buildRedemption({
  effectiveExpiresAt: '2026-12-01T09:00:00.000Z',
  id: 'redemption-storage',
  instanceSlug: 'globex-production',
  redeemedAt: '2026-10-01T09:00:00.000Z',
  voucher: STORAGE_BOOST,
});
export const DISCOUNT_REDEMPTION = buildRedemption({
  applicationsCount: 1,
  applicationsMax: 3,
  id: 'redemption-welcome',
  instanceSlug: 'globex-production',
  redeemedAt: '2026-03-01T10:00:00.000Z',
  voucher: WELCOME,
});

/** The limit of an entitlement of the instance, as its usage reads it: the limit is the effective one. */
export const usageOf = (
  entitlementSlug: string,
  limit: number,
): EntitlementUsage => ({
  entitlementId: `entitlement-${entitlementSlug}`,
  entitlementSlug,
  licenseId: 'license-business-2',
  licenseSlug: 'business-v2',
  limit: { type: 'number', value: limit },
  value: { type: 'number', value: 4 },
});

/** The invoice the next boundary will issue, as the API composes it: the discount is a field of it. */
export const upcoming = (total: number, discountTotal = 0): InvoicePreview =>
  ({
    asOf: '2026-10-09T10:00:00.000Z',
    boundaryAt: '2026-10-27T00:00:00.000Z',
    currency: 'USD',
    discountTotal,
    kind: 'RENEWAL',
    lines: [],
    subtotal: total + discountTotal,
    total,
    wouldHold: false,
  }) as unknown as InvoicePreview;
