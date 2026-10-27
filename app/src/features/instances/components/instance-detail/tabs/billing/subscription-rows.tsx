import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import {
  BILLING_TIMING_LABEL_KEYS,
  formatBoundary,
  formatInstant,
  isCheckoutAwaitingPayment,
  formatUtcDate,
  getCancellationReasonLabelKey,
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
        value={
          isCheckoutAwaitingPayment(subscription) &&
          subscription.incompleteExpiresAt ? (
            <>
              <SubscriptionStatusBadge subscription={subscription} />
              <span
                className="block pt-1 text-xs font-normal text-muted-foreground"
                data-testid="incomplete-expiry-hint"
              >
                {t(
                  'Pages.Customers.Instances.Detail.Billing.Subscription.incompleteExpiry',
                  {
                    date: formatInstant(
                      subscription.incompleteExpiresAt,
                      i18n.language,
                    ),
                  },
                )}
              </span>
            </>
          ) : (
            <SubscriptionStatusBadge subscription={subscription} />
          )
        }
        align={
          isCheckoutAwaitingPayment(subscription) ? 'start' : undefined
        }
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
            <TermsSource own={subscription.daysUntilDueOverride !== null} />
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
  // A cancellation Kaiten made itself carries a reserved code, said in words; the text a
  // person gave when they canceled is shown as it was written.
  const reasonKey = subscription.cancellationReason
    ? getCancellationReasonLabelKey(subscription.cancellationReason)
    : undefined;

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
          value={reasonKey ? t(reasonKey) : subscription.cancellationReason}
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

/** What a checkout waiting for its payment turns the instance into once it is paid. */
function PendingLicenseRow({ license }: { license: string }) {
  const { t } = useTranslation();

  return (
    <DetailCard.Row
      align="start"
      label={t(
        'Pages.Customers.Instances.Detail.Billing.Subscription.fields.pendingLicense',
      )}
      value={
        <>
          <span className="font-mono text-sm">{license}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {t(
              'Pages.Customers.Instances.Detail.Billing.Subscription.pendingLicenseHint',
            )}
          </span>
        </>
      }
    />
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
      ) : subscription.status === 'INCOMPLETE' ? (
        // The close never selects it: there is no boundary to wait for, only the payment.
        subscription.pendingLicenseSlug ? (
          <PendingLicenseRow license={subscription.pendingLicenseSlug} />
        ) : null
      ) : (
        <>
          <BoundaryRow subscription={subscription} />
          {/* A checkout pending over a free subscription, which goes on until it is paid. */}
          {subscription.pendingLicenseSlug ? (
            <PendingLicenseRow license={subscription.pendingLicenseSlug} />
          ) : null}
        </>
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
