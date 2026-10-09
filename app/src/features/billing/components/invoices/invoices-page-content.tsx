import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { handoffStatusOf } from '../../schemas/handoff-search.schema';
import { readInvoiceListSeed } from '../../schemas/invoice-list-seed.schema';
import {
  type InvoiceScope,
  readInvoiceScope,
} from '../../schemas/invoice-scope.schema';
import {
  type InvoicesSearch,
  invoicesViewOf,
} from '../../schemas/invoices-search.schema';
import { HandoffView } from '../handoff';
import { InvoicesAllView } from './invoices-all-view';

type InvoicesPageContentProps = {
  /** Writes the scope to the URL, which the page follows. */
  onScopeChange: (scope: InvoiceScope) => void;
  /** What the URL holds: the view, and under it the scope, the filters or the part of the queue. */
  search: InvoicesSearch;
};

/**
 * The invoices of the organization. It is one page with two views of its list, told
 * apart by the URL: every invoice, which is what finance works from and what makes a
 * deployment with no payment provider auditable, and the handoff queue its
 * accounting system reads. The route loads the view it was asked for, and the page
 * only draws it under one title.
 */
export function InvoicesPageContent({
  onScopeChange,
  search,
}: InvoicesPageContentProps) {
  const { t } = useTranslation();
  const InvoiceIcon = dataModelIcons.invoice;
  const isHandoff = invoicesViewOf(search) === 'handoff';

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
              {t(
                isHandoff
                  ? 'Pages.Billing.Handoff.subtitle'
                  : 'Pages.Billing.Invoices.subtitle',
              )}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="flex-1 min-h-0">
        {isHandoff ? (
          <HandoffView status={handoffStatusOf(search)} />
        ) : (
          <InvoicesAllView
            onScopeChange={onScopeChange}
            scope={readInvoiceScope(search)}
            seed={readInvoiceListSeed(search)}
          />
        )}
      </div>
    </Page>
  );
}
