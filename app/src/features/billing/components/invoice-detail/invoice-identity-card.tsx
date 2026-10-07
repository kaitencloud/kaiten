import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';

type InvoiceIdentityCardProps = {
  invoice: Invoice;
};

/**
 * Who the invoice was composed for, as it was when it was composed. The customer,
 * the instance and the license are a snapshot: the invoice outlives its customer
 * and its instance, and a rename since does not change what was billed, so it is
 * shown as it is and never read again from the record that may be gone. The
 * invoices of the same customer or instance are one link away, since that is the
 * question an invoice raises.
 */
export function InvoiceIdentityCard({ invoice }: InvoiceIdentityCardProps) {
  const { t } = useTranslation();

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Billing.Invoices.Detail.Identity.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t('Pages.Billing.Invoices.Detail.Identity.description')}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            align="start"
            label={t('Pages.Billing.Invoices.Detail.Identity.customer')}
            value={
              <>
                {invoice.customerName}
                <span className="block font-mono text-xs text-muted-foreground">
                  {invoice.customerSlug}
                </span>
              </>
            }
          />
          <DetailCard.Row
            align="start"
            label={t('Pages.Billing.Invoices.Detail.Identity.instance')}
            value={
              <>
                {invoice.instanceName}
                <span className="block font-mono text-xs text-muted-foreground">
                  {invoice.instanceSlug}
                </span>
              </>
            }
          />
          <DetailCard.Row
            label={t('Pages.Billing.Invoices.Detail.Identity.license')}
            value={
              <span className="font-mono text-xs">{invoice.licenseSlug}</span>
            }
          />
          {invoice.billingEmail ? (
            <DetailCard.Row
              align="start"
              label={t('Pages.Billing.Invoices.Detail.Identity.billingEmail')}
              value={invoice.billingEmail}
            />
          ) : null}
        </DetailCard.Rows>
        <DetailCard.Divider />
        <div className="flex flex-col gap-1 text-sm">
          <Link
            className="text-primary-subtle-foreground underline underline-offset-4"
            search={{ customerSlug: invoice.customerSlug }}
            to="/billing/invoices"
          >
            {t('Pages.Billing.Invoices.Detail.Identity.customerInvoices')}
          </Link>
          <Link
            className="text-primary-subtle-foreground underline underline-offset-4"
            search={{ instanceSlug: invoice.instanceSlug }}
            to="/billing/invoices"
          >
            {t('Pages.Billing.Invoices.Detail.Identity.instanceInvoices')}
          </Link>
        </div>
      </DetailCard.Content>
    </DetailCard>
  );
}
