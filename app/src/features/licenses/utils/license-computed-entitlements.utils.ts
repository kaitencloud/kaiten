import type { Entitlement } from '@/api-client';
import {
  type CombinedGrant,
  combineGrants,
  isCombinedEntitlement,
} from '@/domains/entitlement-usage';
import type { EditableLicenseEntitlement } from './license-entitlements.utils';

/** What a license grants of one source of a combined entitlement. */
export type ComputedPart = {
  /** What the license grants of the source; -1 is unlimited. */
  grant: number;
  name: string;
  slug: string;
  /** The weight the source is summed at, an exact decimal string. */
  weight: string;
};

/** A combined entitlement, as the grants of a license make it. */
export type ComputedEntitlement = {
  entitlement: Entitlement;
  limit: CombinedGrant;
  /** The sources the license grants, with their grant; the others count for nothing. */
  parts: ComputedPart[];
};

/**
 * The combined entitlements a license version makes, from what it grants of their
 * sources: a combined entitlement is granted by no license, it is the weighted sum of
 * the sources one grants, and it exists for an instance as soon as one of them is
 * granted to it. A combined entitlement none of whose sources the license grants is not
 * listed. `rows` are the grants of the version, `entitlements` the catalogue.
 */
export function buildComputedEntitlements(
  entitlements: readonly Entitlement[],
  rows: readonly EditableLicenseEntitlement[],
): ComputedEntitlement[] {
  const bySlug = new Map(
    entitlements.flatMap((entitlement) =>
      entitlement.slug ? [[entitlement.slug, entitlement] as const] : [],
    ),
  );
  const grantById = new Map(
    rows.flatMap((row) =>
      row.entitlementId &&
      row.entitlementType === 'NUMBER' &&
      row.threshold !== null
        ? [[row.entitlementId, row.threshold] as const]
        : [],
    ),
  );
  const grantOf = (slug: string) => {
    const source = bySlug.get(slug);

    return source ? grantById.get(source.id) : undefined;
  };

  return entitlements.flatMap((entitlement) => {
    if (!isCombinedEntitlement(entitlement)) {
      return [];
    }
    const sources = entitlement.sources ?? [];
    const limit = combineGrants(sources, grantOf);
    if (!limit) {
      return [];
    }

    return [
      {
        entitlement,
        limit,
        parts: sources.flatMap(({ entitlementSlug, weight }) => {
          const grant = grantOf(entitlementSlug);

          return grant === undefined
            ? []
            : [
                {
                  grant,
                  name: bySlug.get(entitlementSlug)?.name ?? entitlementSlug,
                  slug: entitlementSlug,
                  weight: weight ?? '1',
                },
              ];
        }),
      },
    ];
  });
}
