import { useQuery } from '@tanstack/react-query';
import {
  addonCompatibilityQueryOptions,
  type LicenseGrantReading,
  useLicenseFamilyHeads,
  useLicenseGrants,
} from '@/domains/billing';

/**
 * What each license the add-on fits grants, by entitlement: the value and the overage
 * allowance a grant of the add-on is told it lowers. An OVERRIDE grant replaces the
 * license's value on every instance that attaches the add-on, and a grant that sets its
 * own percentage replaces the license's allowance, so what the license grants is what
 * the person has to be told they are lowering. A license family is read as the API
 * resolves it -- its default version, else its newest published one -- and what that
 * version grants is read for each family the add-on fits, one request per family. It
 * is a reading of licenses: a session that may not read them has nothing to compare,
 * and the grant simply carries no warning.
 */
export function useCompatibleLicenseGrants(
  addonSlug: string,
): ReadonlyMap<string, LicenseGrantReading[]> {
  const compatibility = useQuery(addonCompatibilityQueryOptions(addonSlug));
  const heads = useLicenseFamilyHeads(compatibility.data?.familySlugs ?? []);

  return useLicenseGrants(heads);
}
