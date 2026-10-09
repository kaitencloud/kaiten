import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  formatBoundary,
  formatServicePeriod,
  getInvoiceKindLabelKey,
  isInvoiceOverdue,
} from '@/domains/billing';
import { instanceInvoicesQueryOptions } from '../../../../../queries';
import { getDaysSince } from '../../../../../utils/subscription-notices.utils';

type PastDueNoticeProps = {
  instanceSlug: string;
  subscription: InstanceBilling;
};

/**
 * Why a subscription is past due: which invoice is overdue, since when, and how
 * long ago. It reads the invoices of the instance, which the card below reads
 * too, and names the oldest one that is unpaid past its due date, which is the one
 * that made the subscription past due. In this version a customer with an unpaid
 * invoice is not restricted, and the notice says so in its own sentence, without
 * a countdown, because there is nothing to count down to.
 */
export function PastDueNotice({
  instanceSlug,
  subscription,
}: PastDueNoticeProps) {
  const { i18n, t } = useTranslation();
  const invoices = useQuery(instanceInvoicesQueryOptions(instanceSlug));
  const oldest = [...(invoices.data?.items ?? [])]
    .filter((invoice) => isInvoiceOverdue(invoice))
    .sort((left, right) =>
      (left.dueAt ?? '').localeCompare(right.dueAt ?? ''),
    )[0];
  const since = subscription.pastDueSince;

  return (
    <Alert data-testid="past-due-notice" role="status" variant="destructive">
      <TriangleAlert />
      <AlertTitle>
        {since
          ? t(
              'Pages.Customers.Instances.Detail.Billing.Notices.PastDue.title',
              {
                count: getDaysSince(since),
                date: formatBoundary(since, i18n.language),
              },
            )
          : t(
              'Pages.Customers.Instances.Detail.Billing.Notices.PastDue.titleUnknown',
            )}
      </AlertTitle>
      <AlertDescription>
        <p>
          {oldest ? (
            <>
              {t(
                'Pages.Customers.Instances.Detail.Billing.Notices.PastDue.invoice',
                {
                  due: formatBoundary(oldest.dueAt, i18n.language),
                  kind: t(getInvoiceKindLabelKey(oldest.kind)),
                  period: formatServicePeriod(
                    oldest.serviceFrom,
                    oldest.serviceTo,
                    i18n.language,
                  ),
                },
              )}{' '}
              <Link
                className="underline underline-offset-4"
                params={{ invoiceId: oldest.id }}
                to="/invoices/$invoiceId"
              >
                {t(
                  'Pages.Customers.Instances.Detail.Billing.Notices.PastDue.viewInvoice',
                )}
              </Link>
            </>
          ) : (
            t(
              'Pages.Customers.Instances.Detail.Billing.Notices.PastDue.invoiceUnknown',
            )
          )}
        </p>
        <p>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Notices.PastDue.accessUnchanged',
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}
