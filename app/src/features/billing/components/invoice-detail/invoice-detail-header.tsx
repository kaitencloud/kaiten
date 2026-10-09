import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { InvoiceStatusBadge, ProviderBadge } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { PushPhase } from '../../hooks';
import { getInvoiceTitle } from '../../utils/invoice-title';
import { InvoiceActions } from './invoice-actions';

type InvoiceDetailHeaderProps = {
  invoice: Invoice;
  /** Starts watching the push the person just asked for. */
  onPushRequested: (invoice: Invoice) => void;
  /** Where the push the person asked for stands. */
  pushPhase: PushPhase;
};

/**
 * The title of an invoice, with its status where it is read first, who it is for,
 * and the actions its status offers. The header stays in place while the lines
 * scroll under it, so that a long invoice keeps its actions in reach.
 */
export function InvoiceDetailHeader({
  invoice,
  onPushRequested,
  pushPhase,
}: InvoiceDetailHeaderProps) {
  const { i18n, t } = useTranslation();
  const InvoiceIcon = dataModelIcons.invoice;

  return (
    <Page.Header>
      <Page.Leading>
        <Page.Icon>
          <InvoiceIcon className="size-8 text-primary-subtle-foreground" />
        </Page.Icon>
        <Page.Heading>
          <Page.TitleRow>
            <Page.Title>
              {getInvoiceTitle(invoice, t, i18n.language)}
            </Page.Title>
            <InvoiceStatusBadge invoice={invoice} />
            <ProviderBadge kind={invoice.providerKind} />
          </Page.TitleRow>
          <Page.Subtitle>
            {t('Pages.Billing.Invoices.Detail.subtitle', {
              customer: invoice.customerName,
              instance: invoice.instanceName,
            })}
          </Page.Subtitle>
        </Page.Heading>
      </Page.Leading>
      <Page.Actions>
        <InvoiceActions
          invoice={invoice}
          onPushRequested={onPushRequested}
          pushPhase={pushPhase}
        />
      </Page.Actions>
    </Page.Header>
  );
}
