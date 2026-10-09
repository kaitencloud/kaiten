import type {
  Addon,
  EntitlementUsage,
  InstanceAddon,
  Price,
} from '@/api-client';
import {
  buildAddon,
  buildInstanceAddon,
  buildPrice,
} from '../../../../../../../../../e2e/app/_support/fixtures';

/** What the add-ons of the Billing tab are tested on: a family of seats that is held, and one of storage that is not. */
export const SEATS_V1: Addon = buildAddon({
  familySlug: 'extra-seats',
  maxQuantity: 3,
  name: 'Extra seats',
  slug: 'extra-seats-v1',
  versionName: '2026',
});

export const STORAGE_V1: Addon = buildAddon({
  description: 'More disk space for the files of an instance',
  familySlug: 'extra-storage',
  maxQuantity: 20,
  name: 'Extra storage',
  slug: 'extra-storage-v1',
  versionName: '2026',
});

export const SEATS_MONTHLY: Price = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seat, monthly',
  id: 'price-seats-monthly',
  isDefault: true,
  unitAmountDecimal: '1000',
});

export const STORAGE_MONTHLY: Price = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra storage, monthly',
  id: 'price-storage-monthly',
  isDefault: true,
  unitAmountDecimal: '800',
});

/** The attachment of two units of seats, billed in advance by the month. */
export const heldSeats = (
  overrides: Partial<Parameters<typeof buildInstanceAddon>[0]> = {},
): InstanceAddon =>
  buildInstanceAddon({
    addon: SEATS_V1,
    attachedAt: '2026-09-08T00:00:00.000Z',
    id: 'attachment-seats',
    prices: [SEATS_MONTHLY],
    quantity: 2,
    ...overrides,
  });

/** What an entitlement of an instance is worth, as its usage reads it: the limit is the effective one. */
export const usageOf = (
  entitlementSlug: string,
  limit: number,
  used = 4,
): EntitlementUsage => ({
  entitlementId: `entitlement-${entitlementSlug}`,
  entitlementSlug,
  licenseId: 'license-business-2',
  licenseSlug: 'business-v2',
  limit: { type: 'number', value: limit },
  value: { type: 'number', value: used },
});
