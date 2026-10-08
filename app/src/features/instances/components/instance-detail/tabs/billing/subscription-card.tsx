import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import {
  SubscriptionPeriodRows,
  SubscriptionTermsRows,
} from './subscription-rows';

type SubscriptionCardProps = {
  /** What the person may do about the subscription, in the header: Subscribe again for one that ended. */
  actions?: ReactNode;
  /** What they may do to one that lives, at the foot of the card: change its plan, its terms, end it. */
  footer?: ReactNode;
  subscription: InstanceBilling;
};

/**
 * How an instance is billed: its status, who collects its invoices, the terms of
 * this contract against the organization's defaults, the price it is pinned to
 * and the period it is in, in UTC. The next boundary is the instant the period
 * closes: its invoice is composed after it. A trial says when it ends and when its
 * first invoice is issued, and a cancellation scheduled for the period's end says
 * when the subscription ends. Everything here is a field of the subscription; the
 * console works nothing out.
 */
export function SubscriptionCard({
  actions,
  footer,
  subscription,
}: SubscriptionCardProps) {
  const { t } = useTranslation();
  const ended = subscription.status === 'CANCELED';

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Customers.Instances.Detail.Billing.Subscription.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t(
            ended
              ? 'Pages.Customers.Instances.Detail.Billing.Subscription.descriptionEnded'
              : 'Pages.Customers.Instances.Detail.Billing.Subscription.description',
          )}
        </DetailCard.Description>
        {actions ? <DetailCard.Action>{actions}</DetailCard.Action> : null}
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <SubscriptionTermsRows subscription={subscription} />
          <DetailCard.Divider />
          <SubscriptionPeriodRows subscription={subscription} />
        </DetailCard.Rows>
        {footer}
      </DetailCard.Content>
    </DetailCard>
  );
}
