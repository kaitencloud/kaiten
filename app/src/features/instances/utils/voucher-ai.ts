import type { Entitlement, Grant, Voucher } from '@/api-client';
import { isAiEntitlement } from '@/domains/ai-credits';

/** Classify only original catalogue discriminators, never grant values or opaque price IDs. */
export type VoucherEntitlement = Pick<Entitlement, 'slug'> &
  Partial<Pick<Entitlement, 'type'>>;

export function isAiVoucherGrant(
  grant: Grant,
  entitlements: readonly VoucherEntitlement[],
) {
  return (
    ('entitlementType' in grant &&
      grant.entitlementType === 'NUMBER_AI_CREDIT') ||
    entitlements.some(
      (item) =>
        item.slug === grant.entitlementSlug && isAiEntitlement(item.type),
    )
  );
}

export function hasAiVoucherGrant(
  voucher: Voucher | undefined,
  entitlements: readonly VoucherEntitlement[],
) {
  return (
    voucher?.grants.some((grant) => isAiVoucherGrant(grant, entitlements)) ===
    true
  );
}
