import { Skeleton } from '@/components/ui/skeleton';
import type { InstancesBilling } from '../hooks/use-instances-billing';
import { InstanceBillingBadge } from './instance-billing-badge';

type InstanceBillingCellProps = {
  billing: InstancesBilling;
  instanceSlug: string;
};

/**
 * The Billing cell of a row of a list of instances: the state of the subscription
 * of the instance, or a placeholder for as long as the subscriptions are being read.
 * The lists show it only once billing can be read (`billing.available`).
 */
export function InstanceBillingCell({
  billing,
  instanceSlug,
}: InstanceBillingCellProps) {
  if (billing.isPending) {
    return (
      <Skeleton
        aria-busy="true"
        className="h-5 w-16"
        data-testid="billing-cell-pending"
      />
    );
  }

  return <InstanceBillingBadge summary={billing.summaryOf(instanceSlug)} />;
}
