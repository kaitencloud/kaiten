import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  InvoicesCard,
  type InvoicesTableColumn,
  invoicesQueryOptions,
} from '@/domains/billing';

// The same array on every render: the table builds its columns from it. Every
// column stays, since the invoices of a customer are for its several instances
// and the first column says which.
const ALL_COLUMNS: readonly InvoicesTableColumn[] = [];

type CustomerInvoicesCardProps = {
  customerSlug: string;
};

/**
 * The invoices of a customer, across its instances and across the names it has
 * had: the API matches the slug of the customer now as well as the one an
 * invoice was composed under. The same table as the organization's list, read
 * whole and paged in the browser.
 */
export function CustomerInvoicesCard({
  customerSlug,
}: CustomerInvoicesCardProps) {
  const { t } = useTranslation();
  const query = useQuery(invoicesQueryOptions({ customerSlug }));

  return (
    <InvoicesCard
      description={t('Pages.Customers.Detail.Billing.Invoices.description')}
      emptyDescription={t('Pages.Customers.Detail.Billing.Invoices.empty')}
      hiddenColumns={ALL_COLUMNS}
      query={query}
      testIdPrefix="customer-invoices"
    />
  );
}
