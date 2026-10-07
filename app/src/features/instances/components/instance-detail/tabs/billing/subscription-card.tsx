import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import {
  BILLING_TIMING_LABEL_KEYS,
  formatBoundary,
  formatUtcDate,
  getPriceAmountParts,
  getPriceLabel,
  joinPriceAmount,
  ProviderBadge,
  ServicePeriod,
  SubscriptionStatusBadge,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';

const COLLECTION_METHOD_KEYS = {
  CHARGE_AUTOMATICALLY:
    'Pages.Customers.Instances.Detail.Billing.Subscription.collectionMethod.CHARGE_AUTOMATICALLY',
  SEND_INVOICE:
    'Pages.Customers.Instances.Detail.Billing.Subscription.collectionMethod.SEND_INVOICE',
} as const satisfies Record<InstanceBilling['collectionMethod'], string>;

type SubscriptionCardProps = {
  /** What the person may do about the subscription, in the header: Subscribe again for one that ended. */
  actions?: ReactNode;
  subscription: InstanceBilling;
};

/** Whose terms a value is: the organization's defaults, or what this contract says. */
function TermsSource({ own }: { own: boolean }) {
  const { t } = useTranslation();

  return (
    <span className="block text-xs font-normal text-muted-foreground">
      {t(
        own
          ? 'Pages.Customers.Instances.Detail.Billing.Subscription.termsSource.contract'
          : 'Pages.Customers.Instances.Detail.Billing.Subscription.termsSource.organization',
      )}
    </span>
  );
}

function BasePrice({ subscription }: { subscription: InstanceBilling }) {
  const { i18n, t } = useTranslation();
  const { basePrice } = subscription;

  return (
    <>
      <span>{getPriceLabel(basePrice, undefined, t)}</span>
      <span className="block text-xs font-normal text-muted-foreground">
        {t('Pages.Customers.Instances.Detail.Billing.Subscription.priceLine', {
          price: joinPriceAmount(
            getPriceAmountParts(basePrice, undefined, t, i18n.language),
          ),
          timing: t(BILLING_TIMING_LABEL_KEYS[basePrice.billingTiming]),
        })}
      </span>
    </>
  );
}

/** The contract: its status, who collects its invoices, on what terms, and the price it is pinned to. */
function SubscriptionTermsRows({
  subscription,
}: {
  subscription: InstanceBilling;
}) {
  const { i18n, t } = useTranslation();

  return (
    <>
      <DetailCard.Row
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.status',
        )}
        value={<SubscriptionStatusBadge subscription={subscription} />}
      />
      {subscription.pastDueSince ? (
        <DetailCard.Row
          label={t(
            'Pages.Customers.Instances.Detail.Billing.Subscription.fields.pastDueSince',
          )}
          value={formatBoundary(subscription.pastDueSince, i18n.language)}
        />
      ) : null}
      <DetailCard.Row
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.provider',
        )}
        value={<ProviderBadge kind={subscription.providerKind} />}
      />
      <DetailCard.Row
        align="start"
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.collection',
        )}
        value={
          <>
            {t(COLLECTION_METHOD_KEYS[subscription.collectionMethod])}
            <TermsSource own={Boolean(subscription.collectionMethodOverride)} />
          </>
        }
      />
      <DetailCard.Row
        align="start"
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.terms',
        )}
        value={
          <>
            {t(
              'Pages.Customers.Instances.Detail.Billing.Subscription.daysUntilDue',
              { count: subscription.daysUntilDue },
            )}
            <TermsSource
              own={subscription.daysUntilDueOverride !== undefined}
            />
          </>
        }
      />
      <DetailCard.Row
        align="start"
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.basePrice',
        )}
        value={<BasePrice subscription={subscription} />}
      />
    </>
  );
}

/** The period it is in, in UTC, and what comes next: the boundary, or when and why it ended. */
function SubscriptionPeriodRows({
  subscription,
}: {
  subscription: InstanceBilling;
}) {
  const { i18n, t } = useTranslation();

  return (
    <>
      <DetailCard.Row
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.currentPeriod',
        )}
        value={
          <ServicePeriod
            from={subscription.currentPeriodStart}
            to={subscription.currentPeriodEnd}
          />
        }
      />
      {subscription.status === 'CANCELED' ? (
        <>
          <DetailCard.Row
            label={t(
              'Pages.Customers.Instances.Detail.Billing.Subscription.fields.canceledAt',
            )}
            value={formatBoundary(subscription.canceledAt, i18n.language)}
          />
          {subscription.cancellationReason ? (
            <DetailCard.Row
              align="start"
              label={t(
                'Pages.Customers.Instances.Detail.Billing.Subscription.fields.cancellationReason',
              )}
              value={subscription.cancellationReason}
            />
          ) : null}
        </>
      ) : (
        <DetailCard.Row
          align="start"
          label={t(
            'Pages.Customers.Instances.Detail.Billing.Subscription.fields.nextBoundary',
          )}
          value={
            <>
              {formatBoundary(subscription.currentPeriodEnd, i18n.language)}
              <span className="block text-xs font-normal text-muted-foreground">
                {t(
                  'Pages.Customers.Instances.Detail.Billing.Subscription.nextBoundaryHint',
                )}
              </span>
            </>
          }
        />
      )}
      <DetailCard.Row
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.startedAt',
        )}
        value={formatUtcDate(subscription.startedAt, i18n.language)}
      />
    </>
  );
}

/**
 * How an instance is billed: its status, who collects its invoices, the terms of
 * this contract against the organization's defaults, the price it is pinned to
 * and the period it is in, in UTC. The next boundary is the instant the period
 * closes: its invoice is composed after it. Everything here is a field of the
 * subscription; the console works nothing out.
 */
export function SubscriptionCard({
  actions,
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
      </DetailCard.Content>
    </DetailCard>
  );
}
