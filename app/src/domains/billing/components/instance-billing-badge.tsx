import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InstanceBillingSummary } from '../logic/instance-billing-summary';
import { SubscriptionStatusBadge } from './subscription-status-badge';

type InstanceBillingBadgeProps = {
  className?: string;
  /** The subscription of the instance; `null` for one that was never subscribed. */
  summary: InstanceBillingSummary | null;
};

/**
 * The state of an instance's subscription, as the lists of instances show it: the
 * badge of the Billing tab (trial, active, past due, canceled, and the end that
 * is scheduled), a dash for an instance nobody ever billed. A status the console
 * does not know is shown as the API wrote it, neutral, and never fails the list.
 */
export function InstanceBillingBadge({
  className,
  summary,
}: InstanceBillingBadgeProps) {
  const { t } = useTranslation();

  if (summary === null) {
    return (
      <span className={cn('text-muted-foreground', className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">
          {t('Features.Billing.SubscriptionStatus.none')}
        </span>
      </span>
    );
  }
  if (summary.status === undefined) {
    return (
      <Badge
        className={cn('font-normal', className)}
        data-status={summary.rawStatus}
        variant="outline"
      >
        {summary.rawStatus}
      </Badge>
    );
  }

  return (
    <SubscriptionStatusBadge
      className={className}
      subscription={{
        cancelAtPeriodEnd: summary.cancelAtPeriodEnd,
        status: summary.status,
      }}
    />
  );
}
