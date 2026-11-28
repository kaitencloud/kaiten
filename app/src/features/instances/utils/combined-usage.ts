import type {
  CombinedSourceUsage,
  Entitlement,
  EntitlementUsage,
} from '@/api-client';

/**
 * What an instance shows of a combined entitlement: the weighted sum of the usage of
 * its sources, which the API computes when it is read. Nothing is reported on it, no
 * license grants it, and nothing is enforced on it.
 */

export type UsageSource = NonNullable<Entitlement['usageSource']>;

/** What the catalogue of entitlements says of where each one's usage comes from, by slug. */
export type UsageSourceLookup = ReadonlyMap<string, UsageSource>;

/** A source of a combined row: what the API says of it, and what the catalogue calls it. */
export type InstanceCombinedSource = CombinedSourceUsage & {
  entitlementName: string;
};

export const isCombinedRow = (row: {
  usageSource?: UsageSource | null;
}): boolean => row.usageSource === 'COMBINED_USAGE';

/**
 * Where the usage of a row comes from. The API sends the sources of a combined entitlement
 * with its usage, which is the surest sign of one; the catalogue says the rest, and a
 * session that cannot read it still sees a combined row for what it is.
 */
export function readUsageSource(
  usage: EntitlementUsage | undefined,
  slug: string | null | undefined,
  usageSourceBySlug: UsageSourceLookup,
): UsageSource | null {
  if (usage?.sources) {
    return 'COMBINED_USAGE';
  }

  return slug ? (usageSourceBySlug.get(slug) ?? null) : null;
}

/** The sources of a combined usage, each with the name the catalogue gives it (its slug without one). */
export function nameSources(
  usage: EntitlementUsage | undefined,
  nameBySlug: ReadonlyMap<string, string>,
): InstanceCombinedSource[] | null {
  return (
    usage?.sources?.map((source) => ({
      ...source,
      entitlementName:
        nameBySlug.get(source.entitlementSlug) ?? source.entitlementSlug,
    })) ?? null
  );
}
