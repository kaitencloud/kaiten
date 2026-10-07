import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';

type InvoiceChainProps = {
  invoice: Invoice;
};

/**
 * Where an invoice stands in the chain of replacements, both ways: a void invoice
 * that was recomposed points to its replacement, and the replacement points back at
 * the one it replaces. An invoice is never edited once it is issued, so a
 * correction is a chain, and this is how a person follows it.
 */
export function InvoiceChain({ invoice }: InvoiceChainProps) {
  const { t } = useTranslation();

  if (!invoice.replacedByInvoiceId && !invoice.replacesInvoiceId) {
    return null;
  }

  return (
    <nav
      aria-label={t('Pages.Billing.Invoices.Detail.Chain.label')}
      className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm"
      data-testid="invoice-chain"
    >
      {invoice.replacesInvoiceId ? (
        <p>
          {t('Pages.Billing.Invoices.Detail.Chain.replaces')}{' '}
          <Link
            className="font-mono text-primary-subtle-foreground underline underline-offset-4"
            params={{ invoiceId: invoice.replacesInvoiceId }}
            to="/billing/invoices/$invoiceId"
          >
            {invoice.replacesInvoiceId}
          </Link>
        </p>
      ) : null}
      {invoice.replacedByInvoiceId ? (
        <p>
          {t('Pages.Billing.Invoices.Detail.Chain.replacedBy')}{' '}
          <Link
            className="font-mono text-primary-subtle-foreground underline underline-offset-4"
            params={{ invoiceId: invoice.replacedByInvoiceId }}
            to="/billing/invoices/$invoiceId"
          >
            {invoice.replacedByInvoiceId}
          </Link>
        </p>
      ) : null}
    </nav>
  );
}
