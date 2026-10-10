import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatBoundary } from '@/domains/billing';
import { getCancellationKind } from '../../../../../utils/cancellation.utils';

type CancelExplanationProps = {
  mode: 'AT_PERIOD_END' | 'IMMEDIATE';
  subscription: Pick<
    InstanceBilling,
    'cancelAtPeriodEnd' | 'currentPeriodEnd' | 'scheduledChange' | 'status'
  >;
};

/** The plan change waiting for the boundary: the API drops it with the cancellation, in both modes. */
function DroppedPlanChange({
  className,
  scheduledChange,
}: {
  className?: string;
  scheduledChange: InstanceBilling['scheduledChange'];
}) {
  const { i18n, t } = useTranslation();

  if (!scheduledChange) {
    return null;
  }

  return (
    <p className={className}>
      {t(
        'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.planChangeDropped',
        { date: formatBoundary(scheduledChange.effectiveAt, i18n.language) },
      )}
    </p>
  );
}

/**
 * What the cancellation the person is about to confirm does and does not do,
 * stated before they confirm it. The first thing they ask is when it ends and what
 * is billed then: at the period's end the period paid for runs out and a final
 * invoice bills what is owed in arrears, which may be nothing; immediately that
 * invoice is issued now, nothing is prorated and the base paid for the period is
 * not refunded; a trial ends at once and bills nothing. The immediate variant
 * looks distinct: it cannot be taken back.
 */
export function CancelExplanation({
  mode,
  subscription,
}: CancelExplanationProps) {
  const { i18n, t } = useTranslation();
  const kind = getCancellationKind(subscription, mode);
  const date = formatBoundary(subscription.currentPeriodEnd, i18n.language);

  if (kind === 'IMMEDIATE') {
    return (
      <Alert data-testid="cancel-explanation" variant="destructive">
        <TriangleAlert />
        <AlertTitle>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.immediate.title',
          )}
        </AlertTitle>
        <AlertDescription>
          <p>
            {t(
              'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.immediate.invoice',
            )}
          </p>
          <p>
            {t(
              'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.immediate.arrears',
            )}
          </p>
          <p>
            {t(
              'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.immediate.final',
            )}
          </p>
          <DroppedPlanChange scheduledChange={subscription.scheduledChange} />
        </AlertDescription>
      </Alert>
    );
  }

  if (kind === 'TRIAL') {
    return (
      <div
        className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm"
        data-testid="cancel-explanation"
      >
        <p className="font-medium">
          {t(
            'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.trial.title',
          )}
        </p>
        <p className="text-muted-foreground">
          {t(
            'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.trial.nothing',
          )}
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm"
      data-testid="cancel-explanation"
    >
      <p className="font-medium">
        {t(
          'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.scheduled.title',
          { date },
        )}
      </p>
      {subscription.cancelAtPeriodEnd ? (
        <p>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.scheduled.already',
          )}
        </p>
      ) : null}
      <p className="text-muted-foreground">
        {t(
          'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.scheduled.paid',
          { date },
        )}
      </p>
      <p className="text-muted-foreground">
        {t(
          'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.scheduled.invoice',
        )}
      </p>
      <DroppedPlanChange
        className="text-muted-foreground"
        scheduledChange={subscription.scheduledChange}
      />
      <p className="text-muted-foreground">
        {t(
          'Pages.Customers.Instances.Detail.Billing.Cancel.Explain.scheduled.undo',
        )}
      </p>
    </div>
  );
}
