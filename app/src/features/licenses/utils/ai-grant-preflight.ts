import { getEntitlementSlug } from '@/domains/billing';
import type { Entitlement } from '@/api-client';
import { isAiEntitlement } from '@/domains/ai-credits';
import type { EditableLicenseEntitlement } from './license-entitlements.utils';

export function assertCopiableGrants(
  rows: EditableLicenseEntitlement[],
  catalogue: Entitlement[],
  aiAvailable: boolean,
) {
  for (const row of rows) {
    const definition = catalogue.find((item) => item.id === row.entitlementId);
    // Silently skipping an unresolved grant would create/publish an incomplete copy.
    if (
      !definition ||
      !getEntitlementSlug(definition) ||
      (!aiAvailable &&
        isAiEntitlement(row.catalogueEntitlementType ?? definition.type))
    ) {
      throw new Error('AIUsage.Disabled');
    }
  }
}
