import type { Entitlement, EntitlementSource } from '@/api-client';
import {
  addDecimalStrings,
  canonicalDecimal,
  multiplyDecimalStrings,
} from '@/lib/decimal';
import { UNLIMITED_THRESHOLD } from './entitlement-enforcement';

/**
 * What the console knows of a combined entitlement (`usageSource`
 * `COMBINED_USAGE`): the weighted sum of the usage of other entitlements, its
 * sources, which the API computes when it is read. Nothing is stored for the
 * sum and nothing is enforced on it, so it is not granted to a license, an
 * add-on or a boost, and it takes no exception, no usage report and no price.
 *
 * Mirrors the rules of `api/internal/modules/entitlements/combined`; keep the
 * two in step, since the API refuses a source that breaks them.
 */

/** The fields of a definition these rules read. */
type SummableDefinition = Pick<
  Entitlement,
  'aggregationMethod' | 'resetAnchor' | 'resetPeriod' | 'type' | 'usageSource'
>;

const SUMMABLE_TYPES: ReadonlyArray<Entitlement['type']> = [
  'NUMBER',
  'NUMBER_AI_CREDIT',
];
const SUMMABLE_AGGREGATIONS: ReadonlyArray<Entitlement['aggregationMethod']> = [
  'SUM',
  'COUNT',
];

export const isCombinedEntitlement = (
  entitlement: Pick<Entitlement, 'usageSource'>,
): boolean => entitlement.usageSource === 'COMBINED_USAGE';

/**
 * Whether a license, an add-on, a voucher boost or an exception can name the
 * entitlement. A combined one is computed from its sources: they are what is
 * granted, boosted or excepted, and the sum follows.
 */
export const isGrantableEntitlement = (
  entitlement: Pick<Entitlement, 'usageSource'>,
): boolean => !isCombinedEntitlement(entitlement);

/** The window a counter is read in: both absent for a lifetime counter. */
export type UsageWindow = Pick<Entitlement, 'resetAnchor' | 'resetPeriod'>;

const windowOf = ({ resetAnchor, resetPeriod }: UsageWindow): UsageWindow => ({
  resetAnchor,
  resetPeriod,
});

export const isSameUsageWindow = (
  left: UsageWindow,
  right: UsageWindow,
): boolean =>
  (left.resetPeriod ?? null) === (right.resetPeriod ?? null) &&
  (left.resetAnchor ?? null) === (right.resetAnchor ?? null);

/**
 * Whether an entitlement can be summed by a combined one that already sums
 * `chosen`: a NUMBER or NUMBER_AI_CREDIT entitlement that is not combined (no sum
 * of sums), aggregated by SUM or COUNT (a weighted sum of an average, a maximum
 * or a latest value means nothing), on the same window as the others, lifetime
 * included.
 */
export function isEligibleSource(
  candidate: SummableDefinition,
  chosen: readonly SummableDefinition[] = [],
): boolean {
  return (
    SUMMABLE_TYPES.includes(candidate.type) &&
    !isCombinedEntitlement(candidate) &&
    SUMMABLE_AGGREGATIONS.includes(candidate.aggregationMethod) &&
    chosen.every((other) => isSameUsageWindow(candidate, other))
  );
}

/**
 * The window a combined entitlement takes: the one its sources share, which the
 * API derives and never lets a caller choose. `undefined` while no source is
 * chosen, which is not the lifetime counter a source with no period has.
 */
export function sharedWindow(
  sources: readonly SummableDefinition[],
): UsageWindow | undefined {
  return sources.length > 0 ? windowOf(sources[0]) : undefined;
}

/** The weight of a source as the API writes it: `1` when omitted, no trailing zero. */
export const canonicalWeight = (weight: string | undefined): string =>
  weight === undefined || weight.trim() === ''
    ? '1'
    : canonicalDecimal(weight.trim());

/**
 * Whether two lists of sources sum the same entitlements at the same weights, in
 * whatever order and however the weights are written (`0.40` is `0.4`). Saving a
 * combined entitlement whose sources differ re-values the present for every
 * instance, the current window included: nothing is stored, so a new weight
 * changes what every customer reads at once.
 */
export function haveSameSources(
  left: ReadonlyArray<Pick<EntitlementSource, 'entitlementSlug' | 'weight'>>,
  right: ReadonlyArray<Pick<EntitlementSource, 'entitlementSlug' | 'weight'>>,
): boolean {
  const signature = (
    sources: ReadonlyArray<
      Pick<EntitlementSource, 'entitlementSlug' | 'weight'>
    >,
  ) =>
    sources
      .map(
        ({ entitlementSlug, weight }) =>
          `${entitlementSlug}=${canonicalWeight(weight)}`,
      )
      .sort()
      .join('|');

  return signature(left) === signature(right);
}

/** What a license grants of a combined entitlement, by the grants of its sources. */
export type CombinedGrant = {
  /** The weighted sum of the grants, an exact decimal string; `-1` when unlimited. */
  limit: string;
  /** Whether a granted source is unlimited, which makes the sum unlimited. */
  unlimited: boolean;
};

// A grant as a plain decimal string: `String` writes 1e21 with an exponent, which
// the decimal helpers read as nothing.
const asDecimal = (grant: number): string =>
  grant.toLocaleString('en-US', {
    maximumFractionDigits: 10,
    useGrouping: false,
  });

/**
 * The limit of a combined entitlement for what a license grants of its sources:
 * the sum of weight times grant over the sources it grants, unlimited (`-1`) as
 * soon as a granted source is. `null` when it grants none, which is when the
 * combined entitlement does not exist for it. `grantOf` answers the grant of a
 * source by its slug, `undefined` or `null` for a source the license does not
 * grant, and `-1` for an unlimited one.
 *
 * The sum is exact: `0.4 × 3` is `1.2`. It is the same rule as `usage.CombineLimits`
 * of the API, which computes what an instance reads.
 */
export function combineGrants(
  sources: ReadonlyArray<Pick<EntitlementSource, 'entitlementSlug' | 'weight'>>,
  grantOf: (entitlementSlug: string) => number | null | undefined,
): CombinedGrant | null {
  let limit = '0';
  let granted = false;

  for (const { entitlementSlug, weight } of sources) {
    const grant = grantOf(entitlementSlug);
    if (grant === null || grant === undefined) {
      continue;
    }
    if (grant === UNLIMITED_THRESHOLD) {
      return { limit: String(UNLIMITED_THRESHOLD), unlimited: true };
    }
    granted = true;
    limit = addDecimalStrings(
      limit,
      multiplyDecimalStrings(canonicalWeight(weight), asDecimal(grant)),
    );
  }

  return granted ? { limit, unlimited: false } : null;
}
