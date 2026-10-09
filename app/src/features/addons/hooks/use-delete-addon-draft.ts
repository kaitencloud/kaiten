import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  deleteAddon,
  deprecateAddonPrice,
  unassignAddonEntitlement,
} from '@/api-client';
import { addonPricesQueryOptions } from '@/domains/billing';
import { getApiErrorMessage } from '@/lib/errors';
import {
  addonGrantsQueryOptions,
  invalidateAddonGrantQueries,
  invalidateAddonPriceQueries,
  invalidateAddonQueries,
} from '../queries';
import { isActivePrice, isFlatFee } from '../utils/addon-price.utils';

// A price that meters a grant keeps the grant: the API refuses to remove an
// entitlement an active price of the version measures, and the grants must go
// before the version does. The console does not list a metered price of an add-on
// (it is never valued), so a person could not retire it: the ones that are still
// active are deprecated first, which is what the API asks of them, and a draft is
// deleted with its prices anyway. This comes before any grant is removed, so that a
// refusal leaves the grants and the version where they were. The prices are
// independent of each other: they go together, and every one is settled before the
// first refusal is raised, so that what is read again after it is what the API holds.
async function deprecateMeteredPrices(
  queryClient: QueryClient,
  addonSlug: string,
) {
  const prices = await queryClient.fetchQuery({
    ...addonPricesQueryOptions(addonSlug),
    staleTime: 0,
  });
  const results = await Promise.allSettled(
    prices
      .filter((price) => isActivePrice(price) && !isFlatFee(price))
      .map((price) =>
        deprecateAddonPrice({
          path: { addonSlug, priceId: price.id },
          throwOnError: true,
        }),
      ),
  );
  const refused = results.find((result) => result.status === 'rejected');
  if (refused) {
    throw refused.reason;
  }
}

// A draft was never on sale, so its grants are only its own configuration and they
// go first: the API refuses to delete a version that still grants anything. A
// version an instance ever held is history and is not deleted: the API says so.
async function deleteDraft(queryClient: QueryClient, addonSlug: string) {
  await deprecateMeteredPrices(queryClient, addonSlug);
  const grants = await queryClient.fetchQuery({
    ...addonGrantsQueryOptions(addonSlug),
    staleTime: 0,
  });
  for (const grant of grants) {
    await unassignAddonEntitlement({
      path: { addonSlug, entitlementSlug: grant.entitlementSlug },
      throwOnError: true,
    });
  }
  await deleteAddon({ path: { addonSlug }, throwOnError: true });
}

/**
 * Deletes a draft version, the way out the API gives for one: archiving is for
 * versions that have been on sale. Its prices and the licenses it fits go with it.
 */
export function useDeleteAddonDraft(onDeleted?: () => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ addonSlug }: { addonSlug: string }) =>
      deleteDraft(queryClient, addonSlug),
    onError: async (error, { addonSlug }) => {
      toast.error(getApiErrorMessage(error, t));
      // A refusal can come after some of the draft went: its grants and its prices
      // are read again, not what the page showed before.
      await Promise.all([
        invalidateAddonGrantQueries(queryClient, addonSlug),
        invalidateAddonPriceQueries(queryClient, addonSlug),
      ]);
    },
    // The lists only: the detail of a version that is gone would be asked for again.
    onSettled: async () => {
      await invalidateAddonQueries(queryClient);
    },
    onSuccess: () => {
      toast.success(t('Pages.Addons.DeleteDraft.success'));
      onDeleted?.();
    },
  });

  return { deleteDraft: mutation.mutate, isPending: mutation.isPending };
}
