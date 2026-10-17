import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Entitlement, License, LicenseWritable } from '@/api-client';
import { useBillingCapabilities } from '@/domains/billing';
import { invalidateLicenseQueries } from '../queries';
import type { EditableLicenseEntitlement } from '../utils/license-entitlements.utils';
import { useLicensePriceCopy } from './use-license-price-copy';
import { useLicenseSave } from './use-license-save';

type CreateVersionOptions = {
  /** The version the new one starts from. */
  baseLicense: License;
  body: LicenseWritable;
  /** Whether the version starts with the prices of its base, where billing is on. */
  copyPrices: boolean;
  draftEntitlements: EditableLicenseEntitlement[];
};

type CreateVersionResult = {
  /** What failed after the version was created, which left it a draft. */
  error?: unknown;
  /** Whether the version was given the prices of its base. */
  hasPrices: boolean;
  license: License;
};

/**
 * Creates a new version of a license from the one it starts from: the version,
 * then its grants, then, where billing is on and the person did not decline,
 * the active prices of the base, then its publication unless it is to stay a
 * draft. The prices come after the grants, since a price meters an entitlement
 * the version must grant, and before the publication, since a version must never
 * be served half made. What there is to copy is read before anything is
 * created, so that a read that fails leaves nothing behind. A create that fails
 * throws; a grant, a price or the publication that fails after it is the
 * result's `error`, with the draft it left.
 */
export function useCreateLicenseVersion(entitlements: Entitlement[]) {
  const queryClient = useQueryClient();
  const { isEnabled: hasBilling } = useBillingCapabilities();
  const { copyPrices, fetchCopiablePrices } = useLicensePriceCopy();
  const { createLicenseWithGrants } = useLicenseSave(entitlements);

  return useCallback(
    async ({
      baseLicense,
      body,
      copyPrices: wantsPrices,
      draftEntitlements,
    }: CreateVersionOptions): Promise<CreateVersionResult> => {
      const pricesToCopy =
        hasBilling && wantsPrices && baseLicense.slug
          ? await fetchCopiablePrices(baseLicense.slug)
          : [];

      const { error, license } = await createLicenseWithGrants({
        afterGrants:
          pricesToCopy.length > 0
            ? async (created) => {
                await copyPrices({
                  existing: [],
                  pending: pricesToCopy,
                  targetSlug: created.slug,
                });
              }
            : undefined,
        body,
        draftEntitlements,
      });
      await invalidateLicenseQueries(queryClient);

      return { error, hasPrices: pricesToCopy.length > 0, license };
    },
    [
      copyPrices,
      createLicenseWithGrants,
      fetchCopiablePrices,
      hasBilling,
      queryClient,
    ],
  );
}
