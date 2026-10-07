import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceLine } from '@/api-client';
import { Button } from '@/components/ui/button';
import { InvoiceLineTypeBadge } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { getInvoiceTitle } from '../../utils/invoice-title';
import { ExportLineReportsButton } from './export-line-reports-button';

type LineDrilldownHeaderProps = {
  /** Whether the reports can be saved: not once the API no longer keeps them. */
  canExport: boolean;
  invoice: Invoice;
  line: InvoiceLine;
};

/**
 * The title of the usage behind a line: what the line bills, the invoice it is
 * on, a way back to that invoice, and the export of every report as a CSV. The
 * way back is a button as well as the trail above: below `md` the trail shows
 * only the level above, which is no page.
 */
export function LineDrilldownHeader({
  canExport,
  invoice,
  line,
}: LineDrilldownHeaderProps) {
  const { i18n, t } = useTranslation();
  const EntitlementIcon = dataModelIcons.entitlement;

  return (
    <Page.Header>
      <Page.Leading>
        <Page.Icon>
          <EntitlementIcon className="size-8 text-primary-subtle-foreground" />
        </Page.Icon>
        <Page.Heading>
          <Page.TitleRow>
            <Page.Title>{line.label}</Page.Title>
            <InvoiceLineTypeBadge type={line.type} />
          </Page.TitleRow>
          <Page.Subtitle>
            {t('Pages.Billing.Invoices.Drilldown.subtitle', {
              invoice: getInvoiceTitle(invoice, t, i18n.language),
            })}
          </Page.Subtitle>
        </Page.Heading>
      </Page.Leading>
      <Page.Actions>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            nativeButton={false}
            role="link"
            render={
              <Link
                params={{ invoiceId: invoice.id }}
                to="/billing/invoices/$invoiceId"
              >
                <ArrowLeft />
                {t('Pages.Billing.Invoices.Drilldown.backToInvoice')}
              </Link>
            }
            variant="outline"
          />
          {canExport && line.id ? (
            <ExportLineReportsButton
              invoiceId={invoice.id}
              lineId={line.id}
              lineSeq={line.seq}
            />
          ) : null}
        </div>
      </Page.Actions>
    </Page.Header>
  );
}
