import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  deleteLicense,
  deleteLicenseEntitlement,
  deprecateLicensePrice,
} from '@/api-client';
import { getLicenseEntitlementsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import {
  invalidateLicensePriceQueries,
  useBillingCapabilities,
} from '@/domains/billing';
import { getApiErrorMessage } from '@/lib/errors';
import {
  invalidateLicenseLists,
  licenseEntitlementsQueryOptions,
  licensePricesQueryOptions,
} from '../queries';
import { isActivePrice, isMeteredModel } from '../utils/license-price.utils';

// A price that meters a grant keeps the grant: the API refuses to remove an
// entitlement an active price of the version measures, on a draft as on a
// published version, and the grants must go before the version does. A draft
// was never on sale, and its prices are deleted with it, so the ones that meter
// are deprecated first, which is what the API asks of them. This comes before
// any grant is removed, so that a refusal leaves the grants and the version where
// they were. The prices are independent of each other: they go together, and
// every one is settled before the first refusal is raised, so that what is read
// again after it is what the API holds.
async function deprecateMeteringPrices(
  queryClient: QueryClient,
  licenseSlug: string,
) {
  const prices = await queryClient.fetchQuery({
    ...licensePricesQueryOptions(licenseSlug),
    staleTime: 0,
  });
  const results = await Promise.allSettled(
    prices
      .filter(
        (price) => isActivePrice(price) && isMeteredModel(price.billingModel),
      )
      .map((price) =>
        deprecateLicensePrice({
          path: { licenseSlug, priceId: price.id },
          throwOnError: true,
        }),
      ),
  );
  const refused = results.find((result) => result.status === 'rejected');
  if (refused) {
    throw refused.reason;
  }
}

// A draft was never on sale, so its grants are only its own configuration --
// the new-version form copies them from the base -- and they go first: the
// API refuses to delete a version that still grants anything. An instance
// still on the draft is the one refusal left, and the API says so. Where
// billing is on, the prices that meter a grant are deprecated before that.
async function deleteDraft(
  queryClient: QueryClient,
  licenseSlug: string,
  hasBilling: boolean,
) {
  if (hasBilling) {
    await deprecateMeteringPrices(queryClient, licenseSlug);
  }
  const grants = await queryClient.fetchQuery({
    ...licenseEntitlementsQueryOptions(licenseSlug),
    staleTime: 0,
  });
  for (const grant of grants.items ?? []) {
    if (!grant.entitlementSlug) {
      continue;
    }
    await deleteLicenseEntitlement({
      path: { entitlementSlug: grant.entitlementSlug, licenseSlug },
      throwOnError: true,
    });
  }
  await deleteLicense({ path: { licenseSlug }, throwOnError: true });
}

// Deletes a draft version, the way out the API gives for one: archiving is
// for versions that have been on sale.
export function useDeleteLicenseDraft(onDeleted?: () => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isEnabled: hasBilling } = useBillingCapabilities();

  const mutation = useMutation({
    mutationFn: ({ licenseSlug }: { licenseSlug: string }) =>
      deleteDraft(queryClient, licenseSlug, hasBilling),
    onSuccess: () => {
      toast.success(t('Pages.Licenses.DeleteDraft.success'));
      onDeleted?.();
    },
    onError: async (error, { licenseSlug }) => {
      toast.error(getApiErrorMessage(error, t));
      // A refusal can come after some of the draft went: its grants and its
      // prices are read again, not what the page showed before.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getLicenseEntitlementsQueryKey({ path: { licenseSlug } }),
        }),
        hasBilling
          ? invalidateLicensePriceQueries(queryClient, licenseSlug)
          : undefined,
      ]);
    },
    onSettled: async () => {
      await invalidateLicenseLists(queryClient);
    },
  });

  return { deleteDraft: mutation.mutate, isPending: mutation.isPending };
}
