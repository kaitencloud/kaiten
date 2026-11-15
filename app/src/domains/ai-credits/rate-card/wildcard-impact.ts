import type { Model } from '@/api-client';
import { requestTypesForModality } from '../pricing/reference-calls';
import type { AiRequestType } from '../pricing/types';
import type { RateCardLicense } from './rate-card-query';

export type WildcardImpactRow = {
  licenseSlug: string;
  licenseName: string;
  entitlementSlug: string;
  /** The wildcard's request type; null prices every type. */
  requestType: AiRequestType | null;
};

/**
 * The wildcard rules ("any model") that will price a new model of this modality
 * as soon as it exists: each version and pool where it gets a price without a
 * rule of its own. Request types the modality does not show are left out, as
 * the rate card does; the server itself would still price them.
 */
export function wildcardImpactOf(
  licenses: readonly RateCardLicense[],
  modality: Model['modality'],
): WildcardImpactRow[] {
  const shown = requestTypesForModality(modality);
  return licenses.flatMap((license) =>
    license.conversionRules
      .filter(
        (rule) =>
          rule.status === 'ACTIVE' &&
          rule.modelSlug === null &&
          (rule.requestType == null || shown.includes(rule.requestType)),
      )
      .map((rule) => ({
        licenseSlug: license.slug,
        licenseName: `${license.name} · ${license.versionName ?? license.version}`,
        entitlementSlug: rule.entitlementSlug,
        requestType: rule.requestType ?? null,
      })),
  );
}
