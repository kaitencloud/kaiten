import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { formatInstant, formatUtcDate, ProviderBadge } from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { getInvoiceDue } from '../../utils/invoice-due';

type InvoiceSummaryCardProps = {
  invoice: Invoice;
};

/**
 * What an invoice is, apart from what it bills and what the strip above it says
 * of the total, the due date and the period: which boundary it was composed at,
 * who collects it, when it was issued and the terms it was issued on, the day an
 * invoice that ended had fallen due (the strip says when it ended, not when it was
 * due), and the reason it was voided or its hold released. Every time is UTC and
 * written as the API sent it.
 */
export function InvoiceSummaryCard({ invoice }: InvoiceSummaryCardProps) {
  const { i18n, t } = useTranslation();
  const language = i18n.language;
  const due = getInvoiceDue(invoice);

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Billing.Invoices.Detail.Summary.title')}
        </DetailCard.Title>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            label={t('Pages.Billing.Invoices.Detail.Summary.boundary')}
            value={formatInstant(invoice.boundaryAt, language)}
          />
          <DetailCard.Row
            label={t('Pages.Billing.Invoices.Detail.Summary.provider')}
            value={<ProviderBadge kind={invoice.providerKind} />}
          />
          {invoice.issuedAt ? (
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Detail.Summary.issued')}
              value={formatInstant(invoice.issuedAt, language)}
            />
          ) : null}
          {invoice.issuedAt && invoice.daysUntilDue !== undefined ? (
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Detail.Summary.terms')}
              value={t('Pages.Billing.Invoices.Detail.Summary.termsValue', {
                count: invoice.daysUntilDue,
              })}
            />
          ) : null}
          {due.kind === 'ended' && due.dueAt ? (
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Detail.Summary.due')}
              value={formatUtcDate(due.dueAt, language)}
            />
          ) : null}
          {invoice.voidReason ? (
            <DetailCard.Row
              align="start"
              label={t('Pages.Billing.Invoices.Detail.Summary.voidReason')}
              value={invoice.voidReason}
            />
          ) : null}
          {invoice.hold?.releasedAt ? (
            <DetailCard.Row
              align="start"
              label={t('Pages.Billing.Invoices.Detail.Summary.released')}
              value={
                invoice.hold.releasedBy
                  ? t('Pages.Billing.Invoices.Detail.Summary.releasedValue', {
                      date: formatInstant(invoice.hold.releasedAt, language),
                      reason: invoice.hold.releaseReason ?? '',
                    })
                  : t(
                      'Pages.Billing.Invoices.Detail.Summary.releasedAutomatically',
                      {
                        date: formatInstant(invoice.hold.releasedAt, language),
                      },
                    )
              }
            />
          ) : null}
        </DetailCard.Rows>
      </DetailCard.Content>
    </DetailCard>
  );
}
