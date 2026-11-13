import { createConversionRule, listConversionRules } from '@/api-client';
import type { ConversionRule } from '@/api-client';

export type RuleCopyResult = { rule: ConversionRule; error?: unknown };
// Run after grants and before publish: a partially priced version must never
// become the family's automatically served newest published version.
export async function copyConversionRules(
  baseLicenseSlug: string,
  licenseSlug: string,
): Promise<RuleCopyResult[]> {
  const { data } = await listConversionRules({
    path: { licenseSlug: baseLicenseSlug },
    query: { status: 'ACTIVE' },
    throwOnError: true,
  });
  const results: RuleCopyResult[] = [];
  for (const rule of data ?? []) {
    try {
      await createConversionRule({
        path: { licenseSlug },
        body: {
          entitlementSlug: rule.entitlementSlug,
          modelSlug: rule.modelSlug,
          requestType: rule.requestType,
          rates: rule.rates,
          minimumCreditsPerRequest: rule.minimumCreditsPerRequest,
          maximumCreditsPerRequest: rule.maximumCreditsPerRequest,
          chargeOnError: rule.chargeOnError,
        },
        throwOnError: true,
      });
      results.push({ rule });
    } catch (error) {
      results.push({ rule, error });
    }
  }
  return results;
}
