import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceLine } from '@/api-client';
import {
  LineFingerprint,
  Money,
  OverageLimits,
  ServicePeriod,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { formatDecimalQuantity } from '@/lib/decimal';

type LineSummaryCardProps = {
  invoice: Pick<Invoice, 'currency'>;
  line: InvoiceLine;
};

/**
 * What the line came to, before the reports behind it: the period it bills, the
 * quantity it was measured at and the quantity it bills (the two differ by the
 * sale unit), how many reset windows the period spans, and the fingerprint the
 * invoice kept of the reports. Every figure is the API's, written as it came:
 * the reports below are there to be checked against it, not to replace it.
 */
export function LineSummaryCard({ invoice, line }: LineSummaryCardProps) {
  const { i18n, t } = useTranslation();
  const language = i18n.language;
  const { metering } = line;

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Billing.Invoices.Drilldown.Summary.title')}
        </DetailCard.Title>
        <DetailCard.Description>{line.description}</DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            align="start"
            label={t('Pages.Billing.Invoices.Drilldown.Summary.period')}
            value={
              <ServicePeriod from={line.serviceFrom} to={line.serviceTo} />
            }
          />
          {metering ? (
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Drilldown.Summary.measured')}
              value={
                <span data-testid="line-measured-quantity">
                  {formatDecimalQuantity(metering.measuredQuantity, language)}
                </span>
              }
            />
          ) : null}
          <DetailCard.Row
            label={t('Pages.Billing.Invoices.Drilldown.Summary.billed')}
            value={
              <span data-testid="line-billed-quantity">
                {formatDecimalQuantity(line.quantity, language)}
              </span>
            }
          />
          {metering && metering.saleUnitFactor !== '1' ? (
            <DetailCard.Row
              label={t('Pages.Billing.Invoices.Drilldown.Summary.saleUnit')}
              value={formatDecimalQuantity(metering.saleUnitFactor, language)}
            />
          ) : null}
          {metering ? (
            <DetailCard.Row
              align="start"
              label={t('Pages.Billing.Invoices.Drilldown.Summary.windows')}
              value={
                <>
                  {t('Pages.Billing.Invoices.Drilldown.Summary.windowsValue', {
                    count: metering.windows,
                  })}
                  {metering.negativeSegmentsFloored > 0 ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t(
                        'Pages.Billing.Invoices.Drilldown.Summary.windowsFloored',
                        { count: metering.negativeSegmentsFloored },
                      )}
                    </span>
                  ) : null}
                </>
              }
            />
          ) : null}
          <DetailCard.Row
            label={t('Pages.Billing.Invoices.Drilldown.Summary.amount')}
            value={<Money amount={line.amount} currency={invoice.currency} />}
          />
        </DetailCard.Rows>
        {line.overage ? <OverageLimits overage={line.overage} /> : null}
        {metering?.ledger ? <LineFingerprint ledger={metering.ledger} /> : null}
      </DetailCard.Content>
    </DetailCard>
  );
}
