import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatInstant,
  getSafeProviderUrl,
  getStripeInvoiceDashboardUrl,
  useBillingProvider,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { Differences } from './reconciliation-differences';

type ReconciliationCardProps = {
  invoice: Invoice;
};

const base = 'Pages.Billing.Invoices.Detail.Reconciliation';

/**
 * What a mismatch on this invoice calls for, in words. Kaiten is authoritative, so an
 * invoice Stripe still holds open is not settled in Stripe: it is voided and composed
 * again, and the actions say how. One Stripe already holds as paid cannot be voided
 * there, so its difference is settled by hand in Stripe, and a void one has nothing left
 * to do.
 */
function getMismatchKey(invoice: Invoice) {
  if (invoice.status === 'PAID') {
    return `${base}.mismatchPaid`;
  }

  return invoice.status === 'VOID'
    ? `${base}.mismatchVoid`
    : `${base}.mismatch`;
}

/**
 * The link to a paid invoice in Stripe, where its credit note and its refund are made by
 * hand. It goes to the dashboard, in the mode the connection reaches; when that mode is
 * not known (a link to the wrong one finds nothing), to the page Stripe hosts for the
 * invoice, only when the address is https; and to nothing when there is neither.
 */
function StripeInvoiceLink({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation();
  const { isPending, standing } = useBillingProvider('STRIPE');
  const href =
    (standing.state === 'connected'
      ? getStripeInvoiceDashboardUrl(
          standing.livemode,
          invoice.provider?.externalInvoiceId,
        )
      : undefined) ?? getSafeProviderUrl(invoice.provider?.hostedInvoiceUrl);

  // Not while the mode is being read: the link would change under the person's cursor.
  if (isPending || !href) {
    return null;
  }

  return (
    <Button
      className="self-start"
      nativeButton={false}
      render={
        <a
          data-link="stripe-invoice"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLink />
          {t(`${base}.openInStripe`)}
        </a>
      }
      role="link"
      size="sm"
      variant="outline"
    />
  );
}

/**
 * How what Kaiten composed compares with what Stripe holds, once the invoice is
 * there. A match says so in a line. A mismatch says what differs, in the API's own
 * terms and none of the console's: the two totals, the lines whose amount differs, the
 * lines either side has alone, the discounts Kaiten composed that Stripe applied with
 * another amount or not at all, the discounts Stripe applied that Kaiten never
 * created, such as a coupon added in its dashboard, and the due date Stripe gave an
 * invoice that is sent for payment, when it is not Kaiten's. A due date can be the
 * only difference, with the amounts equal. Nothing is added up or subtracted here. Kaiten
 * is authoritative, so the card does not send a person to settle the difference in Stripe:
 * the actions of the invoice void it and compose it again, and the card says that the
 * charge waits for a match. A mismatch on an invoice Stripe already holds as paid is the
 * one it cannot void: the card says it is settled in Stripe by hand, and links there.
 */
export function ReconciliationCard({ invoice }: ReconciliationCardProps) {
  const { i18n, t } = useTranslation();
  const record = invoice.provider;
  const detail = record?.reconciliationDetail;

  if (invoice.providerKind !== 'STRIPE' || !record?.reconciliationStatus) {
    return null;
  }
  const mismatched = record.reconciliationStatus === 'MISMATCH';
  // An uncharged invoice that Stripe holds open waits for the match to be charged.
  const chargeWaits =
    invoice.status === 'PUSHED' &&
    invoice.collectionMethod === 'CHARGE_AUTOMATICALLY';
  const settledByHand = mismatched && invoice.status === 'PAID';

  return (
    <section data-testid="reconciliation">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title className="flex items-center gap-2 text-base">
            {t(`${base}.title`)}
            <Badge
              data-reconciliation={record.reconciliationStatus}
              variant={mismatched ? 'destructive' : 'success'}
            >
              {t(
                `Pages.Billing.Invoices.Detail.Provider.Reconciliation.${record.reconciliationStatus}`,
              )}
            </Badge>
          </DetailCard.Title>
          <DetailCard.Description>
            {mismatched ? t(getMismatchKey(invoice)) : t(`${base}.matched`)}
            {mismatched && chargeWaits ? ` ${t(`${base}.chargeWaits`)}` : ''}
            {record.reconciledAt
              ? ` ${t(`${base}.checked`, {
                  date: formatInstant(record.reconciledAt, i18n.language),
                })}`
              : ''}
          </DetailCard.Description>
        </DetailCard.Header>
        {settledByHand || (mismatched && detail) ? (
          <DetailCard.Content className="gap-5">
            {settledByHand ? <StripeInvoiceLink invoice={invoice} /> : null}
            {mismatched && detail ? (
              <Differences currency={invoice.currency} detail={detail} />
            ) : null}
          </DetailCard.Content>
        ) : null}
      </DetailCard>
    </section>
  );
}
