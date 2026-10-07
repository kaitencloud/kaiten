import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import {
  formatInstant,
  formatUtcDate,
  getInvoiceKindLabelKey,
  ProviderBadge,
  ServicePeriod,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';

type InvoiceSummaryCardProps = {
  invoice: Invoice;
};

/**
 * What an invoice is, apart from what it bills: which boundary it was composed
 * at, the period its lines cover, when it was issued and is due, who collects it,
 * and how it ended when it did (paid, written off, voided, with the reason).
 * Every time is UTC and written as the API sent it.
 */
export function InvoiceSummaryCard({ invoice }: InvoiceSummaryCardProps) {
  const { i18n, t } = useTranslation();
  const language = i18n.language;

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
            label={t('Pages.Billing.Invoices.Detail.Summary.kind')}
            value={t(getInvoiceKindLabelKey(invoice.kind))}
          />
          <DetailCard.Row
            label={t('Pages.Billing.Invoices.Detail.Summary.boundary')}
            value={formatInstant(invoice.boundaryAt, language)}
          />
          <DetailCard.Row
            align="start"
            label={t('Pages.Billing.Invoices.Detail.Summary.period')}
            value={
              <ServicePeriod
                from={invoice.serviceFrom}
                to={invoice.serviceTo}
              />
            }
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
          {invoice.dueAt ? (
            <DetailCard.Row
              align="start"
              label={t('Pages.Billing.Invoices.Detail.Summary.due')}
              value={t('Pages.Billing.Invoices.Detail.Summary.dueValue', {
                count: invoice.daysUntilDue ?? 0,
                date: formatUtcDate(invoice.dueAt, language),
              })}
            />
          ) : null}
          {invoice.paidAt ? (
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Detail.Summary.paid')}
              value={formatInstant(invoice.paidAt, language)}
            />
          ) : null}
          {invoice.uncollectibleAt ? (
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Detail.Summary.writtenOff')}
              value={formatInstant(invoice.uncollectibleAt, language)}
            />
          ) : null}
          {invoice.voidedAt ? (
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Detail.Summary.voided')}
              value={formatInstant(invoice.voidedAt, language)}
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
