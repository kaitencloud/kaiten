import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  type BillingProblem,
  billingCapabilitiesQueryOptions,
  formatUtcDate,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';

type UpcomingInvoiceOutsideRetentionProps = {
  /** The refusal of the upcoming invoice that says the usage is no longer kept. */
  problem: BillingProblem;
};

/**
 * What the card of the upcoming invoice says when the API cannot compose it because the
 * period it bills begins before the usage the organization keeps
 * (`GetUpcomingInvoice.OutsideRetention`). It is not a failure and asking again changes
 * nothing, so it is told as what it is: the preview needs the usage reports of the first
 * days of the period, which were purged on purpose, and the invoice is not affected,
 * since the close of the period still bills the usage that was recorded. It names where
 * the kept usage begins, and how long the organization keeps it when the capabilities
 * tell. The retention is read as the capabilities have it, billing on or off.
 */
export function UpcomingInvoiceOutsideRetention({
  problem,
}: UpcomingInvoiceOutsideRetentionProps) {
  const { i18n, t } = useTranslation();
  const { data } = useQuery(billingCapabilitiesQueryOptions);
  const months = data?.usageHistoryRetentionMonths;
  const { retentionStart } = problem;
  const base = 'Pages.Customers.Instances.Detail.Billing.Upcoming';

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>{t(`${base}.title`)}</DetailCard.Title>
        <DetailCard.Description>
          {t(`${base}.description`)}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <Alert data-testid="upcoming-invoice-outside-retention">
          <History />
          <AlertTitle>{t(`${base}.OutsideRetention.title`)}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{t(`${base}.OutsideRetention.explanation`)}</p>
            {retentionStart ? (
              <p>
                {t('Features.Billing.Problems.outsideRetention', {
                  date: formatUtcDate(retentionStart, i18n.language),
                })}
                {months
                  ? ` ${t(`${base}.OutsideRetention.keptFor`, { count: months })}`
                  : ''}
              </p>
            ) : (
              <p>{problem.detail}</p>
            )}
            <p>{t(`${base}.OutsideRetention.invoiceUnaffected`)}</p>
          </AlertDescription>
        </Alert>
      </DetailCard.Content>
    </DetailCard>
  );
}
