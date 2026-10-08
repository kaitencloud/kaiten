import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import {
  formatBoundary,
  getInvoiceKindLabelKey,
  Money,
} from '@/domains/billing';
import { upcomingInvoiceQueryOptions } from '../../../../../queries';
import { useDescribePlan } from './use-describe-plan';

type PlanChangeTimelineProps = {
  instanceSlug: string;
  subscription: InstanceBilling;
};

/**
 * What a plan change does and when, said before it is confirmed. It takes effect
 * at the end of the current period, never before, and the invoice of that day bills
 * what the current plan owes in arrears together with the first period of the new
 * one in advance, with nothing prorated. The API cannot preview that invoice for a
 * plan that is not scheduled yet, so the console does not draw one: it shows the
 * invoice the next boundary would issue as things stand, the API's own, and says
 * so. Once a change is scheduled the invoice already applies it, and the sentence
 * says that instead.
 */
export function PlanChangeTimeline({
  instanceSlug,
  subscription,
}: PlanChangeTimelineProps) {
  const { i18n, t } = useTranslation();
  const describe = useDescribePlan();
  const upcoming = useQuery(upcomingInvoiceQueryOptions(instanceSlug));
  const date = formatBoundary(subscription.currentPeriodEnd, i18n.language);
  const plan = describe(subscription.basePrice);
  const preview = upcoming.data;

  return (
    <div
      className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm"
      data-testid="plan-change-timeline"
    >
      <p>
        <span className="font-medium">
          {t('Pages.Customers.Instances.Detail.Billing.PlanChange.currentPlan')}
        </span>{' '}
        {t(
          'Pages.Customers.Instances.Detail.Billing.PlanChange.currentPlanValue',
          {
            amount: plan.amount,
            price: plan.price,
          },
        )}
      </p>
      <p>
        {t('Pages.Customers.Instances.Detail.Billing.PlanChange.timeline', {
          date,
        })}
      </p>
      {preview ? (
        <p className="text-muted-foreground" data-testid="plan-change-upcoming">
          {t(
            subscription.scheduledChange
              ? 'Pages.Customers.Instances.Detail.Billing.PlanChange.upcomingScheduled'
              : 'Pages.Customers.Instances.Detail.Billing.PlanChange.upcoming',
            { kind: t(getInvoiceKindLabelKey(preview.kind)).toLowerCase() },
          )}{' '}
          <Money amount={preview.total} currency={preview.currency} />
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('Pages.Customers.Instances.Detail.Billing.PlanChange.noPreview')}
      </p>
    </div>
  );
}
