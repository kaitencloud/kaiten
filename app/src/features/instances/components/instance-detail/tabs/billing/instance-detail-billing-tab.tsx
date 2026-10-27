import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { RetryableProblem } from '@/domains/billing';
import { instanceBillingQueryOptions } from '../../../../queries';
import { useInstanceDetail } from '../../instance-detail-context';
import { InstanceAddonsCard } from './addons';
import { InstanceInvoicesCard } from './instance-invoices-card';
import { NotSubscribedCard } from './not-subscribed-card';
import { SubscribeAction } from './subscribe-action';
import { SubscriptionActions } from './subscription-actions';
import { SubscriptionCard } from './subscription-card';
import { SubscriptionNotices } from './notices/subscription-notices';
import { UpcomingInvoiceCard } from './upcoming-invoice-card';
import { InstanceVouchersCard } from './vouchers';

type InstanceDetailBillingTabProps = {
  /** A dialog the route opens over the tab, such as the one that subscribes. */
  children?: ReactNode;
};

/**
 * The billing of one instance: whether it is subscribed and how, what its next
 * boundary will issue, and the invoices it has had; what the subscription is going
 * through (a trial, an overdue invoice, a cancellation or a plan change waiting for
 * the boundary) is said above its card, and what may be done to it under the card; what
 * it holds besides, the add-ons and the vouchers it redeemed, follows.
 * It reads its own data, so that a refusal of billing (the scope is missing, the API
 * is down) is shown here, with a way to ask again, and never blanks the page around
 * it. An instance that was never subscribed is a state of the tab, not an error, and
 * one whose subscription ended can be subscribed again.
 */
export function InstanceDetailBillingTab({
  children,
}: InstanceDetailBillingTabProps) {
  const { t } = useTranslation();
  const { instance, license } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const query = useQuery(instanceBillingQueryOptions(instanceSlug));

  function renderBody() {
    if (query.isPending) {
      return (
        <div
          aria-busy="true"
          aria-label={t('Pages.Customers.Instances.Detail.Billing.loading')}
          className="space-y-4"
          role="status"
        >
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      );
    }
    if (query.isError) {
      return (
        <RetryableProblem
          data-testid="instance-billing-error"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      );
    }

    const subscription = query.data;
    if (!subscription) {
      return (
        <div className="space-y-4 lg:space-y-6">
          <NotSubscribedCard instanceSlug={instanceSlug} license={license} />
          <InstanceAddonsCard instanceSlug={instanceSlug} subscription={null} />
          <InstanceVouchersCard instanceSlug={instanceSlug} />
        </div>
      );
    }
    const ended = subscription.status === 'CANCELED';

    return (
      <div className="grid grid-cols-1 items-start gap-4 lg:gap-6 xl:grid-cols-2">
        <SubscriptionNotices
          instanceSlug={instanceSlug}
          subscription={subscription}
        />
        <SubscriptionCard
          actions={
            ended ? (
              <SubscribeAction instanceSlug={instanceSlug} license={license} />
            ) : undefined
          }
          footer={
            ended ? undefined : (
              <SubscriptionActions
                instanceSlug={instanceSlug}
                subscription={subscription}
              />
            )
          }
          subscription={subscription}
        />
        {ended ? null : <UpcomingInvoiceCard instanceSlug={instanceSlug} />}
        <div className="xl:col-span-2">
          <InstanceAddonsCard
            instanceSlug={instanceSlug}
            subscription={subscription}
          />
        </div>
        <div className="xl:col-span-2">
          <InstanceVouchersCard instanceSlug={instanceSlug} />
        </div>
        <div className="xl:col-span-2">
          <InstanceInvoicesCard instanceSlug={instanceSlug} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {renderBody()}
      {children}
    </div>
  );
}
