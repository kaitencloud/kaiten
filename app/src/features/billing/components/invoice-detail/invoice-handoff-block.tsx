import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceHandoff } from '@/api-client';
import {
  formatInstant,
  HandoffStatusLabel,
  isHandoffLeased,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { isInHandoff } from '../../utils/invoice-handoff';

type InvoiceHandoffBlockProps = {
  /** What the page gives the block in its grid: the columns it spans. */
  className?: string;
  invoice: Invoice;
};

type HandoffRowsProps = {
  handoff: InvoiceHandoff;
};

/** What waits in the queue: how many times a consumer took it, and until when one holds it. */
function PendingRows({ handoff }: HandoffRowsProps) {
  const { i18n, t } = useTranslation();

  return (
    <>
      <DetailCard.Row
        label={t('Pages.Billing.Invoices.Detail.Handoff.claims')}
        value={handoff.claimCount}
      />
      {isHandoffLeased(handoff) ? (
        <DetailCard.Row
          label={t('Pages.Billing.Invoices.Detail.Handoff.leasedUntil')}
          value={formatInstant(handoff.leasedUntil, i18n.language)}
        />
      ) : null}
    </>
  );
}

/** What was booked: the number the accounting system gave the invoice, and when it said so. */
function AcknowledgedRows({ handoff }: HandoffRowsProps) {
  const { i18n, t } = useTranslation();

  return (
    <>
      <DetailCard.Row
        label={t('Pages.Billing.Invoices.Detail.Handoff.reference')}
        value={
          handoff.externalReference ? (
            <span className="font-mono">{handoff.externalReference}</span>
          ) : (
            t('Pages.Billing.Invoices.Detail.Handoff.noReference')
          )
        }
      />
      <DetailCard.Row
        label={t('Pages.Billing.Invoices.Detail.Handoff.acknowledgedAt')}
        value={formatInstant(handoff.acknowledgedAt, i18n.language)}
      />
    </>
  );
}

/**
 * Where an invoice stands in the queue the organization's accounting system reads,
 * which is how an invoice nobody collects through a provider reaches the accounts:
 * waiting, and how many times a consumer has taken it; or acknowledged, under the
 * number the accounting system gave it. An invoice that never needed handing off
 * (nothing owed, or a payment provider collects it) has no block: it is absent,
 * not empty. Voiding or writing an invoice off leaves a handoff that was pending
 * pending: the block says so, since the consumer of the queue will see the invoice
 * as void or written off, and acknowledges it as it would any other.
 */
export function InvoiceHandoffBlock({
  className,
  invoice,
}: InvoiceHandoffBlockProps) {
  const { t } = useTranslation();
  const { handoff } = invoice;

  if (!isInHandoff(invoice)) {
    return null;
  }
  // A void or written-off invoice stays in the queue, and its consumer sees it as such.
  const endedAs =
    invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE'
      ? invoice.status
      : undefined;

  return (
    <section className={className} data-testid="invoice-handoff">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title className="text-base">
            {t('Pages.Billing.Invoices.Detail.Handoff.title')}
          </DetailCard.Title>
          {handoff.status === 'PENDING' ? (
            <DetailCard.Description>
              {t('Pages.Billing.Invoices.Detail.Handoff.waiting', {
                context: endedAs,
              })}
            </DetailCard.Description>
          ) : null}
        </DetailCard.Header>
        <DetailCard.Content>
          <DetailCard.Rows>
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Detail.Handoff.status')}
              value={
                // A value of the card like the others: the label mutes what was
                // acknowledged for a list, where it is the quiet one among rows.
                <HandoffStatusLabel
                  className="text-foreground"
                  status={handoff.status}
                />
              }
            />
            {handoff.status === 'PENDING' ? (
              <PendingRows handoff={handoff} />
            ) : (
              <AcknowledgedRows handoff={handoff} />
            )}
          </DetailCard.Rows>
        </DetailCard.Content>
      </DetailCard>
    </section>
  );
}
