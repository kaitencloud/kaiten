import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  type BillingProblem,
  billingCapabilitiesQueryOptions,
  formatUtcDate,
} from '@/domains/billing';
import { ceilToUtcDay } from '../../../../../utils/usage-history.utils';

type UsageHistoryOutsideRetentionProps = {
  /** The refusal the period came back with. */
  problem: BillingProblem;
  /** Starts the period where the kept usage begins. */
  onStartFrom: (from: string) => void;
};

/**
 * What the drawer shows when the period reaches before what the organization
 * keeps: not a failure, since usage is purged on purpose. It says how long the
 * organization keeps it, when the capabilities tell, where the kept usage begins,
 * and offers to start there. The retention is read from the capabilities as they
 * are, billing on or off: the history is not billing's, and a deployment without
 * billing still keeps usage for some months.
 */
export function UsageHistoryOutsideRetention({
  onStartFrom,
  problem,
}: UsageHistoryOutsideRetentionProps) {
  const { i18n, t } = useTranslation();
  const { data } = useQuery(billingCapabilitiesQueryOptions);
  const months = data?.usageHistoryRetentionMonths;
  const { retentionStart } = problem;
  // Periods are typed in whole days: the first day that starts in what is kept.
  const firstDay = retentionStart ? ceilToUtcDay(retentionStart) : undefined;

  return (
    <Alert data-testid="usage-history-outside-retention">
      <History />
      <AlertTitle>
        {months
          ? t(
              'Pages.Customers.Instances.Detail.entitlements.history.OutsideRetention.title',
              { count: months },
            )
          : t(
              'Pages.Customers.Instances.Detail.entitlements.history.OutsideRetention.titleUnknown',
            )}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        {retentionStart ? (
          <p>
            {t('Features.Billing.Problems.outsideRetention', {
              date: formatUtcDate(retentionStart, i18n.language),
            })}
          </p>
        ) : (
          <p>{problem.detail}</p>
        )}
        {firstDay ? (
          <Button
            onClick={() => onStartFrom(firstDay)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t(
              'Pages.Customers.Instances.Detail.entitlements.history.OutsideRetention.showFrom',
              { date: formatUtcDate(firstDay, i18n.language) },
            )}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
