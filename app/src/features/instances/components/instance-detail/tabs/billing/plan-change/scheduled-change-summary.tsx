import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  BoundaryClosingNotice,
  formatBoundary,
  ProblemAlert,
  useCanPerform,
} from '@/domains/billing';
import { useCancelPlanChangeAction } from '../../../../../hooks/use-lifecycle-actions';
import {
  findPlanTarget,
  type PlanTarget,
} from '../../../../../utils/plan-change.utils';
import { useDescribePlan } from './use-describe-plan';

type ScheduledChangeSummaryProps = {
  instanceSlug: string;
  scheduledChange: NonNullable<InstanceBilling['scheduledChange']>;
  targets: readonly PlanTarget[];
};

/**
 * The plan change that is already scheduled, at the top of the dialog that
 * schedules one: choosing another plan replaces it, and it can be dropped here.
 */
export function ScheduledChangeSummary({
  instanceSlug,
  scheduledChange,
  targets,
}: ScheduledChangeSummaryProps) {
  const { i18n, t } = useTranslation();
  const describe = useDescribePlan();
  const mayDrop = useCanPerform('subscription.cancelPlanChange');
  const drop = useCancelPlanChangeAction(instanceSlug);
  const plan = describe(
    scheduledChange.price,
    findPlanTarget(targets, scheduledChange.price.id)?.license,
  );

  return (
    <div
      className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm"
      data-testid="plan-change-scheduled"
    >
      <p>
        {t(
          'Pages.Customers.Instances.Detail.Billing.PlanChange.alreadyScheduled',
          {
            amount: plan.amount,
            date: formatBoundary(scheduledChange.effectiveAt, i18n.language),
            plan: plan.version ?? plan.price,
          },
        )}
      </p>
      {mayDrop ? (
        <Button
          disabled={drop.isSending}
          onClick={() => void drop.perform()}
          size="sm"
          type="button"
          variant="outline"
        >
          {t('Pages.Customers.Instances.Detail.Billing.PlanChange.drop')}
        </Button>
      ) : null}
      {drop.closing ? <BoundaryClosingNotice /> : null}
      {drop.failure && !drop.closing ? (
        <ProblemAlert
          error={drop.failure}
          onRetry={() => void drop.perform()}
        />
      ) : null}
    </div>
  );
}
