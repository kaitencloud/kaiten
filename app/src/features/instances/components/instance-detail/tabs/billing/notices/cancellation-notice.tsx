import { CalendarX2, RotateCcw } from 'lucide-react';
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
import { useReactivateAction } from '../../../../../hooks/use-lifecycle-actions';

type CancellationNoticeProps = {
  instanceSlug: string;
  subscription: InstanceBilling;
};

/**
 * A cancellation scheduled for the end of the period: when the subscription ends,
 * and the way to take it back, which is one click away for as long as the notice
 * stands. The status of the subscription has not changed and nothing is lost until
 * the boundary, so the notice says what is still true: access is as it was, and the
 * final invoice bills what is owed in arrears, which may be nothing. A period that
 * is being closed is waited out, and any other refusal is shown beside the button.
 */
export function CancellationNotice({
  instanceSlug,
  subscription,
}: CancellationNoticeProps) {
  const { i18n, t } = useTranslation();
  const { has } = useBillingCapabilities();
  const mayReactivate = useCanPerform('subscription.reactivate');
  const reactivate = useReactivateAction(instanceSlug);

  return (
    <Alert data-testid="cancellation-notice" role="status">
      <CalendarX2 />
      <AlertTitle>
        {t(
          'Pages.Customers.Instances.Detail.Billing.Notices.Cancellation.title',
          {
            date: formatBoundary(subscription.currentPeriodEnd, i18n.language),
          },
        )}
      </AlertTitle>
      <AlertDescription>
        <p>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Notices.Cancellation.description',
          )}
        </p>
        {subscription.cancellationReason ? (
          <p>
            {t(
              'Pages.Customers.Instances.Detail.Billing.Notices.Cancellation.reason',
              { reason: subscription.cancellationReason },
            )}
          </p>
        ) : null}
        {has('lifecycle') && mayReactivate ? (
          <Button
            className="mt-2"
            disabled={reactivate.isSending}
            onClick={() => void reactivate.perform()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw />
            {t('Pages.Customers.Instances.Detail.Billing.Reactivate.action')}
          </Button>
        ) : null}
        {reactivate.closing ? (
          <BoundaryClosingNotice className="mt-2 w-full" />
        ) : null}
        {reactivate.failure && !reactivate.closing ? (
          <ProblemAlert
            className="mt-2 w-full"
            error={reactivate.failure}
            onRetry={() => void reactivate.perform()}
          />
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
