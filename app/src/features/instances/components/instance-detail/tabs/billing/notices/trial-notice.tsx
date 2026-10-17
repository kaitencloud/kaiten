import { Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatBoundary } from '@/domains/billing';
import {
  getDaysUntil,
  getFirstInvoiceAfterTrial,
} from '../../../../../utils/subscription-notices.utils';

type TrialNoticeProps = {
  subscription: InstanceBilling;
};

/**
 * Where a subscription in trial stands: when the trial ends, how long is left, and
 * when the first invoice is issued. Nothing is billed during a trial and the usage
 * of the trial is never billed, so the notice says that too: the first thing a
 * person asks is whether the customer is being charged.
 */
export function TrialNotice({ subscription }: TrialNoticeProps) {
  const { i18n, t } = useTranslation();
  const endsAt = subscription.trialEndsAt ?? subscription.currentPeriodEnd;

  return (
    <Alert data-testid="trial-notice" role="status">
      <Hourglass />
      <AlertTitle>
        {t('Pages.Customers.Instances.Detail.Billing.Notices.Trial.title', {
          date: formatBoundary(endsAt, i18n.language),
        })}
      </AlertTitle>
      <AlertDescription>
        <p>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Notices.Trial.description',
            { count: getDaysUntil(endsAt) },
          )}
        </p>
        <p>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Notices.Trial.firstInvoice',
            {
              date: formatBoundary(
                getFirstInvoiceAfterTrial(subscription),
                i18n.language,
              ),
            },
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}
