import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { RouteTabs } from '@/functionals/route-tabs';
import { dataModelIcons } from '@/lib/data-model-icons';
import { handoffQueryOptions } from '../../queries';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import { HandoffList } from './handoff-list';

type HandoffPageContentProps = {
  /** Which part of the queue the URL asks for. */
  status: HandoffQueueStatus;
};

type TabDefinition = {
  labelKey: string;
  /** What the tab adds to the path: what waits is the bare path of the route. */
  search?: Record<string, string>;
};

// One tab to each status the API reads the queue in: a status it adds fails the
// type check until it has a tab.
const TABS = {
  PENDING: { labelKey: 'Pages.Billing.Handoff.Tabs.pending' },
  ACKNOWLEDGED: {
    labelKey: 'Pages.Billing.Handoff.Tabs.acknowledged',
    search: { status: 'ACKNOWLEDGED' },
  },
} as const satisfies Record<HandoffQueueStatus, TabDefinition>;

/**
 * The queue the organization's accounting system reads: the invoices issued with no
 * payment provider behind them, oldest first, as they wait to be booked and once
 * they were. A job or the CLI takes them and acknowledges them; this page shows
 * where that stands, and lets a person acknowledge one they booked by hand. The
 * part of the queue shown is in the URL, so that a link to the waiting invoices
 * survives a reload, and the route loads every invoice of it, like the other list
 * pages load theirs.
 */
export function HandoffPageContent({ status }: HandoffPageContentProps) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(handoffQueryOptions(status));
  const InvoiceIcon = dataModelIcons.invoice;
  const tabs = (
    Object.entries(TABS) as [HandoffQueueStatus, TabDefinition][]
  ).map(([tabStatus, { labelKey, search }]) => ({
    id: tabStatus,
    label: t(labelKey),
    search,
    to: '/billing/handoff',
  }));

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <InvoiceIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Billing.Handoff.title')}</Page.Title>
            <Page.Subtitle>{t('Pages.Billing.Handoff.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <RouteTabs tabs={tabs} />
      <div className="flex-1 min-h-0">
        {/* Each part of the queue is a list of its own: its search and its filters
            do not follow the person from one tab to the other. */}
        <HandoffList invoices={data.items} key={status} status={status} />
      </div>
    </Page>
  );
}
