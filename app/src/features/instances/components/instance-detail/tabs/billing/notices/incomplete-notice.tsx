import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CreditCard, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  formatInstant,
  getSafeProviderUrl,
  useCanPerform,
} from '@/domains/billing';
import {
  instanceInvoicesQueryOptions,
  instanceInvoiceQueryOptions,
} from '../../../../../queries';
import {
  getAwaitedActivation,
  getHoursUntil,
} from '../../../../../utils/subscription-notices.utils';

type IncompleteNoticeProps = {
  instanceSlug: string;
  subscription: InstanceBilling;
};

const BASE = 'Pages.Customers.Instances.Detail.Billing.Notices.Incomplete';

/**
 * What a checkout that waits for its payment waits for: the activation invoice, which
 * must be paid before it lapses, and the license the instance moves to once it is.
 * Until then nothing the checkout bought applies, so the notice says what is still
 * true (the instance keeps its license, its add-ons and its vouchers), what it is
 * waiting for, and what the vendor may do about it: open the invoice, here or where
 * the payment provider hosts it for the customer, or cancel the checkout, which ends
 * it at once. Add-ons and plan changes are fixed until it is paid, and the actions say so.
 * A checkout pending over a free subscription reads the same, except that the free
 * subscription goes on when it lapses.
 */
export function IncompleteNotice({
  instanceSlug,
  subscription,
}: IncompleteNoticeProps) {
  const { i18n, t } = useTranslation();
  const mayReadInvoice = useCanPerform('invoice.read');
  const invoices = useQuery(instanceInvoicesQueryOptions(instanceSlug));
  const awaited = getAwaitedActivation(invoices.data?.items ?? []);
  const detail = useQuery({
    ...instanceInvoiceQueryOptions(awaited?.id ?? ''),
    enabled: mayReadInvoice && awaited !== undefined,
  });
  const hostedUrl = getSafeProviderUrl(detail.data?.provider?.hostedInvoiceUrl);
  const expiresAt = subscription.incompleteExpiresAt;
  const hoursLeft = expiresAt ? getHoursUntil(expiresAt) : 0;
  const license = subscription.pendingLicenseSlug;
  // A checkout pending over a free subscription replaces it once paid: unpaid, it
  // lapses and the free subscription goes on, instead of a subscription canceled.
  const suffix = subscription.status === 'INCOMPLETE' ? '' : 'Free';

  return (
    <Alert data-testid="incomplete-notice" role="status">
      <CreditCard />
      <AlertTitle>
        {expiresAt
          ? t(`${BASE}.title`, { date: formatInstant(expiresAt, i18n.language) })
          : t(`${BASE}.titleNoExpiry`)}
      </AlertTitle>
      <AlertDescription>
        <p data-testid="incomplete-expiry">
          {expiresAt
            ? hoursLeft > 0
              ? t(`${BASE}.left${suffix}`, { count: hoursLeft })
              : t(`${BASE}.lapsing${suffix}`)
            : t(`${BASE}.noExpiry${suffix}`)}
        </p>
        <p data-testid="incomplete-pending-license">
          {license
            ? t(`${BASE}.pending`, { license })
            : t(`${BASE}.pendingUnknown`)}
        </p>
        <p>{t(`${BASE}.vendor`)}</p>
        {awaited && mayReadInvoice ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              nativeButton={false}
              render={
                <Link
                  data-testid="incomplete-invoice-link"
                  params={{ invoiceId: awaited.id }}
                  to="/invoices/$invoiceId"
                >
                  {t(`${BASE}.invoice`)}
                </Link>
              }
              role="link"
              size="sm"
              variant="outline"
            />
            {hostedUrl ? (
              <Button
                nativeButton={false}
                render={
                  <a
                    data-testid="incomplete-hosted-link"
                    href={hostedUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink />
                    {t(`${BASE}.hosted`)}
                  </a>
                }
                role="link"
                size="sm"
                variant="outline"
              />
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
