import { ArrowRightLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  BoundaryClosingNotice,
  formatBoundary,
  ProblemAlert,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';
import { usePlanTargets } from '../../../../../hooks/use-plan-targets';
import { useCancelPlanChangeAction } from '../../../../../hooks/use-lifecycle-actions';
import { findPlanTarget } from '../../../../../utils/plan-change.utils';
import { useDescribePlan } from '../plan-change/use-describe-plan';

type ScheduledChangeNoticeProps = {
  instanceSlug: string;
  scheduledChange: NonNullable<InstanceBilling['scheduledChange']>;
  subscription: InstanceBilling;
};

/**
 * The plan change waiting for the next boundary: which plan the subscription
 * moves to and when, with the way to drop the change. The price the API gives is
 * not tied to a license, so the license version it belongs to is found among the
 * versions on sale, for a session that may read them; while they are read, when
 * none of them has the price and when they cannot be read, the notice names the
 * price alone and is no less true.
 */
export function ScheduledChangeNotice({
  instanceSlug,
  scheduledChange,
  subscription,
}: ScheduledChangeNoticeProps) {
  const { i18n, t } = useTranslation();
  const { has } = useBillingCapabilities();
  const mayDrop = useCanPerform('subscription.cancelPlanChange');
  const drop = useCancelPlanChangeAction(instanceSlug);
  const describe = useDescribePlan();
  // Naming the license costs a read of every license and of the prices of each
  // version: only a session that may read them pays for it.
  const mayReadPlans = useCanPerform('licensePrices.read');
  const { targets } = usePlanTargets(subscription, { enabled: mayReadPlans });
  const plan = describe(
    scheduledChange.price,
    findPlanTarget(targets, scheduledChange.price.id)?.license,
  );

  return (
    <Alert data-testid="scheduled-change-notice" role="status">
      <ArrowRightLeft />
      <AlertTitle>
        {t(
          'Pages.Customers.Instances.Detail.Billing.Notices.ScheduledChange.title',
          {
            amount: plan.amount,
            date: formatBoundary(scheduledChange.effectiveAt, i18n.language),
            plan: plan.version ?? plan.price,
          },
        )}
      </AlertTitle>
      <AlertDescription>
        <p>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Notices.ScheduledChange.description',
          )}
        </p>
        {has('lifecycle') && mayDrop ? (
          <Button
            className="mt-2"
            disabled={drop.isSending}
            onClick={() => void drop.perform()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('Pages.Customers.Instances.Detail.Billing.PlanChange.drop')}
          </Button>
        ) : null}
        {drop.closing ? (
          <BoundaryClosingNotice className="mt-2 w-full" />
        ) : null}
        {drop.failure && !drop.closing ? (
          <ProblemAlert
            className="mt-2 w-full"
            error={drop.failure}
            onRetry={() => void drop.perform()}
          />
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
