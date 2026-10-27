import { useQuery } from '@tanstack/react-query';
import { useBillingCapabilities } from '@/domains/billing';
import {
  licenseFamiliesQueryOptions,
  licensesWithInstancesQueryOptions,
} from '../queries';
import { hasFallbackGap } from '../utils/license-family-fallback-gap.utils';

/**
 * Whether the family is public, has a paid version and names no fallback, as the
 * saved family and the whole list of versions say (not the rows a filter left).
 * Billing's, so false where billing is off. The lists are the ones the page
 * loaded, and are read from the cache.
 */
export function useLicenseFamilyFallbackGap(familyId: string | undefined) {
  const { isEnabled } = useBillingCapabilities();
  const { data: families } = useQuery({
    ...licenseFamiliesQueryOptions,
    enabled: isEnabled && Boolean(familyId),
  });
  const { data: licenses } = useQuery({
    ...licensesWithInstancesQueryOptions,
    enabled: isEnabled && Boolean(familyId),
  });
  const family = families?.items.find((candidate) => candidate.id === familyId);

  return Boolean(
    isEnabled &&
    family &&
    licenses &&
    hasFallbackGap({
      fallbackSlug: family.fallbackLicenseFamilySlug,
      family,
      licenses,
    }),
  );
}
