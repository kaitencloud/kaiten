import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { type InvoicesTableColumn, InvoicesCard } from '@/domains/billing';
import { instanceInvoicesQueryOptions } from '../../../../queries';

// The same array on every render: the table builds its columns from it. The
// customer and the instance are the page's own.
const WITHOUT_INVOICE_COLUMN: readonly InvoicesTableColumn[] = ['invoice'];

type InstanceInvoicesCardProps = {
  instanceSlug: string;
};

/** The invoices of the subscription of the instance, in the table of every invoice. */
export function InstanceInvoicesCard({
  instanceSlug,
}: InstanceInvoicesCardProps) {
  const { t } = useTranslation();
  const query = useQuery(instanceInvoicesQueryOptions(instanceSlug));

  return (
    <InvoicesCard
      description={t(
        'Pages.Customers.Instances.Detail.Billing.Invoices.description',
      )}
      emptyDescription={t(
        'Pages.Customers.Instances.Detail.Billing.Invoices.empty',
      )}
      hiddenColumns={WITHOUT_INVOICE_COLUMN}
      query={query}
      testIdPrefix="instance-invoices"
    />
  );
}
