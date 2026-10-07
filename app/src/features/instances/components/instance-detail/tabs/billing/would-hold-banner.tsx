import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InvoicePreview } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getHoldReasonLabelKey, isKnownHoldReason } from '@/domains/billing';
import { useInstanceDetail } from '../../instance-detail-context';

type WouldHoldBannerProps = {
  instanceSlug: string;
  wouldHold: InvoicePreview['wouldHold'];
};

/**
 * Why the invoice previewed would not be issued: the usage journal of some
 * meters fails a check, and billing does not bill an amount it cannot vouch for.
 * Each meter is named with the check that failed and leads to its history, where
 * the reports behind the number are. The check is a verdict of the API; this says
 * it in words and never decides it.
 */
export function WouldHoldBanner({
  instanceSlug,
  wouldHold,
}: WouldHoldBannerProps) {
  const { t } = useTranslation();
  const { entitlementsRows } = useInstanceDetail();

  if (wouldHold.length === 0) {
    return null;
  }

  function renderItem({
    entitlementId,
    invariant,
  }: InvoicePreview['wouldHold'][number]) {
    const row = entitlementsRows.find(
      (candidate) => candidate.entitlementId === entitlementId,
    );
    const reason = isKnownHoldReason(invariant)
      ? t(getHoldReasonLabelKey(invariant))
      : invariant;

    return (
      <li key={`${entitlementId}-${invariant}`}>
        {t('Pages.Customers.Instances.Detail.Billing.Upcoming.WouldHold.item', {
          entitlement:
            row?.entitlementName ??
            t(
              'Pages.Customers.Instances.Detail.Billing.Upcoming.WouldHold.unknownEntitlement',
            ),
          reason,
        })}{' '}
        {row?.entitlementSlug ? (
          <Link
            className="underline underline-offset-4"
            params={{ instanceSlug }}
            search={{ history: row.entitlementSlug }}
            to="/customers/instances/$instanceSlug/entitlements"
          >
            {t(
              'Pages.Customers.Instances.Detail.Billing.Upcoming.WouldHold.history',
            )}
          </Link>
        ) : null}
      </li>
    );
  }

  return (
    <Alert data-testid="would-hold-banner" role="status">
      <TriangleAlert className="text-warning-subtle-foreground" />
      <AlertTitle>
        {t('Pages.Customers.Instances.Detail.Billing.Upcoming.WouldHold.title')}
      </AlertTitle>
      <AlertDescription>
        <p>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Upcoming.WouldHold.description',
          )}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {wouldHold.map(renderItem)}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
