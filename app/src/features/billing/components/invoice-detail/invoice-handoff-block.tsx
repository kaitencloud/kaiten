import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import {
  formatInstant,
  HandoffStatusLabel,
  isHandoffLeased,
} from '@/domains/billing';

type InvoiceHandoffBlockProps = {
  invoice: Invoice;
};

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
export function InvoiceHandoffBlock({ invoice }: InvoiceHandoffBlockProps) {
  const { i18n, t } = useTranslation();
  const { handoff } = invoice;

  if (handoff.status === 'NOT_REQUIRED') {
    return null;
  }
  // A void or written-off invoice stays in the queue, and its consumer sees it as such.
  const endedAs =
    invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE'
      ? invoice.status
      : undefined;

  return (
    <section data-testid="invoice-handoff">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title>
            {t('Pages.Billing.Invoices.Detail.Handoff.title')}
          </DetailCard.Title>
          <DetailCard.Description>
            <HandoffStatusLabel status={handoff.status} />
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          {handoff.status === 'PENDING' ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t('Pages.Billing.Invoices.Detail.Handoff.waiting', {
                  context: endedAs,
                })}
              </p>
              <DetailCard.Rows>
                <DetailCard.Row
                  label={t('Pages.Billing.Invoices.Detail.Handoff.claims')}
                  value={handoff.claimCount}
                />
                {isHandoffLeased(handoff) ? (
                  <DetailCard.Row
                    label={t(
                      'Pages.Billing.Invoices.Detail.Handoff.leasedUntil',
                    )}
                    value={formatInstant(handoff.leasedUntil, i18n.language)}
                  />
                ) : null}
              </DetailCard.Rows>
            </>
          ) : (
            <DetailCard.Rows>
              <DetailCard.Row
                label={t('Pages.Billing.Invoices.Detail.Handoff.reference')}
                value={
                  handoff.externalReference ? (
                    <span className="font-mono">
                      {handoff.externalReference}
                    </span>
                  ) : (
                    t('Pages.Billing.Invoices.Detail.Handoff.noReference')
                  )
                }
              />
              <DetailCard.Row
                label={t(
                  'Pages.Billing.Invoices.Detail.Handoff.acknowledgedAt',
                )}
                value={formatInstant(handoff.acknowledgedAt, i18n.language)}
              />
            </DetailCard.Rows>
          )}
        </DetailCard.Content>
      </DetailCard>
    </section>
  );
}
