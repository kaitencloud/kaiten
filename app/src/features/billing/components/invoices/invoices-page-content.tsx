import { useTranslation } from 'react-i18next';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { InvoiceFilters } from '../../schemas/invoice-filters.schema';
import { ExportInvoicesMenu } from './export-invoices-menu';
import { InvoiceFiltersToolbar } from './invoice-filters-toolbar';
import { InvoicesList } from './invoices-list';

type InvoicesPageContentProps = {
  /** The filters the URL holds. */
  filters: InvoiceFilters;
  /** Writes the filters to the URL, which the list follows. */
  onFiltersChange: (filters: InvoiceFilters) => void;
};

/**
 * The invoices of the organization, across its customers and instances: what was
 * composed at each boundary, in what status, and where it stands in the handoff
 * queue. It is the view finance works from, and what makes a deployment with no
 * payment provider auditable. The filters are the API's and live in the URL, so
 * that a list can be linked to and survives a reload; the export takes the same
 * filters.
 */
export function InvoicesPageContent({
  filters,
  onFiltersChange,
}: InvoicesPageContentProps) {
  const { t } = useTranslation();
  const { capabilities } = useBillingCapabilities();
  const canExport = useCanPerform('invoices.export');
  const InvoiceIcon = dataModelIcons.invoice;
  // With NoOp alone, who collects an invoice is never a question; a filter
  // already on stays shown, so that it can be taken off.
  const showProvider =
    filters.providerKind !== undefined ||
    (capabilities?.providers.some(({ kind }) => kind === 'STRIPE') ?? false);

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <InvoiceIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Billing.Invoices.title')}</Page.Title>
            <Page.Subtitle>
              {t('Pages.Billing.Invoices.subtitle')}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
        <Page.Actions>
          {canExport ? <ExportInvoicesMenu filters={filters} /> : null}
        </Page.Actions>
      </Page.Header>
      <InvoiceFiltersToolbar
        filters={filters}
        onChange={onFiltersChange}
        showProvider={showProvider}
      />
      <InvoicesList
        filters={filters}
        onClearFilters={() => onFiltersChange({})}
        showProvider={showProvider}
      />
    </Page>
  );
}
