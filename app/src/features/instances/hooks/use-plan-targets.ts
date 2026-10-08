import { useQueries, useQuery } from '@tanstack/react-query';
import type { InstanceBilling, License, Price } from '@/api-client';
import {
  planTargetLicensesQueryOptions,
  subscribablePricesQueryOptions,
} from '../queries';
import {
  buildPlanTargets,
  isOnSale,
  type PlanTarget,
} from '../utils/plan-change.utils';

type PlanTargetsState = {
  /** The failure of the first read that failed, to show with a way to ask again. */
  error: unknown;
  isError: boolean;
  isPending: boolean;
  refetch: () => void;
  targets: PlanTarget[];
};

/**
 * The plans a subscription can move to. The API has no list of the prices of an
 * organization, so they are found where they are: every version of every
 * license, then the active flat fees of each version on sale, one read per
 * version. Reads happen only when `enabled`, for a screen that needs them: the
 * dialog that picks a plan, and the banner of a change that is scheduled, which
 * names the license of the price it moves to.
 */
export function usePlanTargets(
  subscription: Pick<InstanceBilling, 'basePrice'>,
  { enabled = true }: { enabled?: boolean } = {},
): PlanTargetsState {
  const licenses = useQuery({
    ...planTargetLicensesQueryOptions(),
    enabled,
  });
  const onSale: License[] =
    enabled && licenses.data ? licenses.data.items.filter(isOnSale) : [];
  const prices = useQueries({
    queries: onSale.map((license) =>
      subscribablePricesQueryOptions(license.slug ?? license.id),
    ),
  });

  const pricesByLicense = new Map<string, readonly Price[]>();
  onSale.forEach((license, index) => {
    const read = prices[index]?.data;
    if (read) {
      pricesByLicense.set(license.slug ?? license.id, read);
    }
  });
  const failed = prices.find((query) => query.isError);

  return {
    error: licenses.error ?? failed?.error ?? null,
    isError: licenses.isError || failed !== undefined,
    isPending:
      enabled &&
      (licenses.isPending || prices.some((query) => query.isPending)),
    refetch: () => {
      void licenses.refetch();
      for (const query of prices) {
        if (query.isError) {
          void query.refetch();
        }
      }
    },
    targets: buildPlanTargets({
      licenses: onSale,
      pricesByLicense,
      subscription,
    }),
  };
}
