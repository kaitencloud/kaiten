import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';

type InvoiceChainRowsProps = {
  invoice: Pick<Invoice, 'replacedByInvoiceId' | 'replacesInvoiceId'>;
};

type ChainLinkProps = {
  invoiceId: string;
  testId: string;
};

function ChainLink({ invoiceId, testId }: ChainLinkProps) {
  return (
    <Link
      className="font-mono text-primary-subtle-foreground underline underline-offset-4"
      data-testid={testId}
      params={{ invoiceId }}
      to="/billing/invoices/$invoiceId"
    >
      {invoiceId}
    </Link>
  );
}

/**
 * Where an invoice stands in the chain of replacements, both ways, as rows of the
 * summary: a void invoice that was recomposed points to its replacement, and the
 * replacement points back at the one it replaces. An invoice is never edited once
 * it is issued, so a correction is a chain, and this is how a person follows it.
 * An invoice outside any chain adds no row.
 */
export function InvoiceChainRows({ invoice }: InvoiceChainRowsProps) {
  const { t } = useTranslation();

  return (
    <>
      {invoice.replacesInvoiceId ? (
        <DetailCard.Row
          align="start"
          label={t('Pages.Billing.Invoices.Detail.Chain.replaces')}
          value={
            <ChainLink
              invoiceId={invoice.replacesInvoiceId}
              testId="invoice-replaces"
            />
          }
        />
      ) : null}
      {invoice.replacedByInvoiceId ? (
        <DetailCard.Row
          align="start"
          label={t('Pages.Billing.Invoices.Detail.Chain.replacedBy')}
          value={
            <ChainLink
              invoiceId={invoice.replacedByInvoiceId}
              testId="invoice-replaced-by"
            />
          }
        />
      ) : null}
    </>
  );
}
