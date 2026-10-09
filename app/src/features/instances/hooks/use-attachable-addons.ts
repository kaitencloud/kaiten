import {
  type UseQueryResult,
  useQueries,
  useQuery,
} from '@tanstack/react-query';
import type {
  Addon,
  CompatibleLicenseFamilies,
  InstanceAddon,
  Problem,
} from '@/api-client';
import {
  addonCompatibilityQueryOptions,
  addonLicenseFamiliesQueryOptions,
} from '@/domains/billing';
import { addonVersionsQueryOptions } from '../queries';
import { getAttachableAddons } from '../utils/instance-addons.utils';

type UseAttachableAddonsOptions = {
  /** Whether to ask at all: a screen that cannot offer add-ons asks for none. */
  enabled?: boolean;
  /** The family the license of the instance belongs to (`License.familyId`). */
  familyId: string | undefined;
  /** What the instance holds already: a family it holds a version of is not offered again. */
  held: readonly InstanceAddon[];
};

// What the reads of the compatibility of each version on sale come to: whether any
// is still being read, the families each version fits, how many could not be read and
// the first refusal among them, and the way to ask again for those. A function of its
// own, so that the result is only built again when a read changes.
const combineFits = (
  results: UseQueryResult<CompatibleLicenseFamilies, Problem>[],
) => ({
  firstUnreadError: results.find((result) => result.isError)?.error ?? null,
  isPending: results.some(
    (result) => result.isPending && result.fetchStatus !== 'idle',
  ),
  refetch: () => {
    for (const result of results) {
      if (result.isError) {
        void result.refetch();
      }
    }
  },
  slugs: results.map((result) => result.data?.familySlugs),
  unreadCount: results.filter((result) => result.isError).length,
});

/**
 * The add-ons an instance can be given: the versions on sale that fit the license
 * family of the instance, of a family it holds no version of. The API lists the
 * license families a version fits and not the versions that fit a family, and
 * filters its list of add-ons by nothing of the sort, so which versions suit the
 * instance is found by asking of each one on sale. The families are found by id, as
 * a license names its own.
 *
 * A version whose compatibility could not be read is not known to fit, so it is left
 * out and the others are still offered: `unreadCount` says how many, with the first
 * refusal in `unreadError`, so that the screen can say some are missing and offer to
 * ask again. `error` is for what leaves nothing to offer, the catalogue or the license
 * families not being readable.
 */
export function useAttachableAddons({
  enabled = true,
  familyId,
  held,
}: UseAttachableAddonsOptions) {
  const versions = useQuery({ ...addonVersionsQueryOptions(), enabled });
  const families = useQuery({ ...addonLicenseFamiliesQueryOptions(), enabled });
  const familySlug = families.data?.items.find(
    (family) => family.id === familyId,
  )?.slug;
  const onSale: Addon[] = (versions.data?.items ?? []).filter(
    (version) => version.lifecycleState === 'PUBLISHED',
  );
  const fits = useQueries({
    combine: combineFits,
    queries: onSale.map((version) => ({
      ...addonCompatibilityQueryOptions(version.slug),
      enabled: enabled && familySlug !== undefined,
    })),
  });
  const compatible = new Set(
    onSale.flatMap((version, index) =>
      familySlug !== undefined && fits.slugs[index]?.includes(familySlug)
        ? [version.slug]
        : [],
    ),
  );

  return {
    error: versions.error ?? families.error,
    isPending:
      enabled && (versions.isPending || families.isPending || fits.isPending),
    items: getAttachableAddons(onSale, { compatible, held }),
    unreadCount: fits.unreadCount,
    unreadError: fits.firstUnreadError,
    refetch: () => {
      if (versions.isError) {
        void versions.refetch();
      }
      if (families.isError) {
        void families.refetch();
      }
      fits.refetch();
    },
  };
}
