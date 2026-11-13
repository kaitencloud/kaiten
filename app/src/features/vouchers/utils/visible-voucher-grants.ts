import type { VoucherNames } from '../types';
import { isAiEntitlement } from '@/domains/ai-credits';

/** Display-only projection. Keep original indices when editing the canonical array. */
export function visibleVoucherGrants<T extends { entitlementSlug: string }>(
  grants: T[],
  names: VoucherNames,
  aiAvailable: boolean,
) {
  return grants
    .map((grant, index) => ({ grant, index }))
    .filter(
      ({ grant }) =>
        aiAvailable ||
        (names.entitlementTypes?.[grant.entitlementSlug] !== undefined &&
          !isAiEntitlement(names.entitlementTypes[grant.entitlementSlug])),
    );
}
