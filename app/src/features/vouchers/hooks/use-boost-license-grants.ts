import { useMemo } from 'react';
import {
  type LicenseGrantReading,
  type LicenseVersionRef,
  useLicenseFamilyHeads,
  useLicenseGrants,
} from '@/domains/billing';
import type { VoucherReferences } from './use-voucher-references';

type UseBoostLicenseGrantsOptions = {
  /** The license versions the voucher is limited to: none checked is no limit. */
  applicableLicenseIds: readonly string[];
  /** Whether a boost sets a value at all: nothing is read for one that does not. */
  enabled: boolean;
  /** The license versions the session can name, to find the ones the voucher is limited to. */
  licenses: VoucherReferences['licenses'];
};

/**
 * What the licenses a boost can be redeemed on grant, by entitlement, for the warning
 * that a SET lowers the value of the license. A voucher limited to some license versions
 * is measured against those; one that is not can be redeemed on any, so it is measured
 * against the version each license family resolves to, one request per family. Nothing is
 * read until `enabled`, and a session that may not read licenses has nothing to compare.
 */
export function useBoostLicenseGrants({
  applicableLicenseIds,
  enabled,
  licenses,
}: UseBoostLicenseGrantsOptions): ReadonlyMap<string, LicenseGrantReading[]> {
  const limited = applicableLicenseIds.length > 0;
  const heads = useLicenseFamilyHeads('all', { enabled: enabled && !limited });
  const limitedKey = applicableLicenseIds.join('\u0000');
  const named = useMemo((): LicenseVersionRef[] => {
    const wanted = new Set(limitedKey ? limitedKey.split('\u0000') : []);

    return (licenses.data?.items ?? []).flatMap((license) =>
      wanted.has(license.id) && license.slug
        ? [{ name: license.name, slug: license.slug }]
        : [],
    );
  }, [licenses.data, limitedKey]);

  return useLicenseGrants(limited ? named : heads, { enabled });
}
