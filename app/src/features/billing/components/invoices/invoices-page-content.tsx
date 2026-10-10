import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoicesQueryOptions } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { readInvoiceListSeed } from '../../schemas/invoice-list-seed.schema';
import {
  type InvoiceScope,
  readInvoiceScope,
} from '../../schemas/invoice-scope.schema';
import {
  HANDOFF_VIEWS,
  type InvoicesSearch,
  type InvoicesView,
  invoicesViewOf,
  isHandoffView,
} from '../../schemas/invoices-search.schema';
import { countInvoicesByView } from '../../utils/invoice-views';
import { HandoffView } from '../handoff';
import { InvoicesAllView } from './invoices-all-view';
import { InvoicesViewTabs } from './invoices-view-tabs';

// Each view says what it shows: the page keeps its title, and its subtitle follows the
// view the person is on.
const SUBTITLE_KEYS = {
  acknowledged: 'Pages.Billing.Invoices.Subtitles.acknowledged',
  all: 'Pages.Billing.Invoices.Subtitles.all',
  held: 'Pages.Billing.Invoices.Subtitles.held',
  overdue: 'Pages.Billing.Invoices.Subtitles.overdue',
  waiting: 'Pages.Billing.Invoices.Subtitles.waiting',
} as const satisfies Record<InvoicesView, string>;

type InvoicesPageContentProps = {
  /** Writes the scope to the URL, which the page follows. */
  onScopeChange: (scope: InvoiceScope) => void;
  /** What the URL holds: the view, and under it the scope or the filters of the list. */
  search: InvoicesSearch;
};

/**
 * The invoices of the organization. It is one list with a row of status views above
 * its toolbar, All, Overdue, Held and the two parts of the queue its accounting
 * system reads, told apart by the URL. The first three narrow the list of invoices,
 * which is what finance works from and what makes a deployment with no payment
 * provider auditable; the last two show the handoff queue. The route loads what the
 * view was asked for, and the page only draws it under one title.
 */
export function InvoicesPageContent({
  onScopeChange,
  search,
}: InvoicesPageContentProps) {
  const { t } = useTranslation();
  const InvoiceIcon = dataModelIcons.invoice;
  const view = invoicesViewOf(search);
  const scope = readInvoiceScope(search);
  // Where each count comes from: all of them from the list of invoices of the
  // scope, which the route loads in every view and the console holds whole. All,
  // Overdue and Held are the invoices that pass the view's test; Waiting and
  // Acknowledged are the invoices whose `handoffStatus` is PENDING and ACKNOWLEDGED,
  // so the queue itself is not read to count them.
  const { data } = useSuspenseQuery(invoicesQueryOptions(scope));
  const counts = useMemo(() => countInvoicesByView(data.items), [data.items]);

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <InvoiceIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Billing.Invoices.title')}</Page.Title>
            <Page.Subtitle>{t(SUBTITLE_KEYS[view])}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="flex min-h-0 flex-1 flex-col">
        <InvoicesViewTabs counts={counts} scope={scope} />
        <div className="min-h-0 flex-1">
          {isHandoffView(view) ? (
            <HandoffView status={HANDOFF_VIEWS[view]} />
          ) : (
            <InvoicesAllView
              onScopeChange={onScopeChange}
              scope={scope}
              seed={readInvoiceListSeed(search)}
              view={view}
            />
          )}
        </div>
      </div>
    </Page>
  );
}
