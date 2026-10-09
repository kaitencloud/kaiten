import type { InstanceBilling } from '@/api-client';
import { useLicensesWithPrices } from '@/domains/billing';
import { buildPlanTargets, type PlanTarget } from '../utils/plan-change.utils';

type PlanTargetsState = {
  /** The failure of the read, to show with a way to ask again. */
  error: unknown;
  isError: boolean;
  isPending: boolean;
  refetch: () => void;
  targets: PlanTarget[];
};

/**
 * The plans a subscription can move to. The REST API has no list of the prices of an
 * organization, and found them with a read of every license and then one read of the
 * prices of each version on sale. They now come in one request, the license versions
 * with the prices each is sold at (`useLicensesWithPrices`), and the plans are the active
 * flat fees of the versions on sale. The request is sent only when `enabled`, for a screen
 * that needs the plans: the dialog that picks a plan, and the banner of a change that is
 * scheduled, which names the license of the price it moves to.
 */
export function usePlanTargets(
  subscription: Pick<InstanceBilling, 'basePrice'>,
  { enabled = true }: { enabled?: boolean } = {},
): PlanTargetsState {
  const licenses = useLicensesWithPrices({ enabled });

  return {
    error: licenses.error,
    isError: licenses.isError,
    isPending: enabled && licenses.isPending,
    refetch: () => void licenses.refetch(),
    targets: buildPlanTargets({
      licenses: enabled ? (licenses.data ?? []) : [],
      subscription,
    }),
  };
}
