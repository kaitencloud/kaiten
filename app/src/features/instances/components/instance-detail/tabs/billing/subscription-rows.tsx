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
import { getFirstInvoiceAfterTrial } from '../../../../utils/subscription-notices.utils';

const COLLECTION_METHOD_KEYS = {
  CHARGE_AUTOMATICALLY:
    'Pages.Customers.Instances.Detail.Billing.Subscription.collectionMethod.CHARGE_AUTOMATICALLY',
  SEND_INVOICE:
    'Pages.Customers.Instances.Detail.Billing.Subscription.collectionMethod.SEND_INVOICE',
} as const satisfies Record<InstanceBilling['collectionMethod'], string>;

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
export function SubscriptionTermsRows({
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

/** The rows of a subscription that ended: when, and why. */
function EndedRows({ subscription }: { subscription: InstanceBilling }) {
  const { i18n, t } = useTranslation();

  return (
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
  );
}

/** The rows of a trial: when it ends, and when its first invoice is issued. */
function TrialRows({ subscription }: { subscription: InstanceBilling }) {
  const { i18n, t } = useTranslation();

  return (
    <>
      <DetailCard.Row
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.trialEndsAt',
        )}
        value={formatBoundary(
          subscription.trialEndsAt ?? subscription.currentPeriodEnd,
          i18n.language,
        )}
      />
      <DetailCard.Row
        label={t(
          'Pages.Customers.Instances.Detail.Billing.Subscription.fields.firstInvoice',
        )}
        value={formatBoundary(
          getFirstInvoiceAfterTrial(subscription),
          i18n.language,
        )}
      />
    </>
  );
}

/** The boundary that ends the period, which ends the subscription too when it is set to cancel. */
function BoundaryRow({ subscription }: { subscription: InstanceBilling }) {
  const { i18n, t } = useTranslation();
  const ends = subscription.cancelAtPeriodEnd;

  return (
    <DetailCard.Row
      align="start"
      label={t(
        ends
          ? 'Pages.Customers.Instances.Detail.Billing.Subscription.fields.endsAt'
          : 'Pages.Customers.Instances.Detail.Billing.Subscription.fields.nextBoundary',
      )}
      value={
        <>
          {formatBoundary(subscription.currentPeriodEnd, i18n.language)}
          <span className="block text-xs font-normal text-muted-foreground">
            {t(
              ends
                ? 'Pages.Customers.Instances.Detail.Billing.Subscription.endsAtHint'
                : 'Pages.Customers.Instances.Detail.Billing.Subscription.nextBoundaryHint',
            )}
          </span>
        </>
      }
    />
  );
}

/** The period it is in, in UTC, and what comes next: the boundary, or when and why it ended. */
export function SubscriptionPeriodRows({
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
        <EndedRows subscription={subscription} />
      ) : subscription.status === 'TRIAL' ? (
        <TrialRows subscription={subscription} />
      ) : (
        <BoundaryRow subscription={subscription} />
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
