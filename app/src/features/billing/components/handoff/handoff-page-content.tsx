import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import { HandoffList } from './handoff-list';

type HandoffPageContentProps = {
  /** Writes the status to the URL, which the page follows. */
  onStatusChange: (status: HandoffQueueStatus) => void;
  /** Which part of the queue the URL asks for. */
  status: HandoffQueueStatus;
};

// One tab to each status the API reads the queue in: a status it adds fails the
// type check until it has a tab.
const TAB_LABEL_KEYS = {
  PENDING: 'Pages.Billing.Handoff.Tabs.pending',
  ACKNOWLEDGED: 'Pages.Billing.Handoff.Tabs.acknowledged',
} as const satisfies Record<HandoffQueueStatus, string>;

const isQueueStatus = (value: unknown): value is HandoffQueueStatus =>
  typeof value === 'string' && Object.hasOwn(TAB_LABEL_KEYS, value);

/**
 * The queue the organization's accounting system reads: the invoices issued with no
 * payment provider behind them, oldest first, as they wait to be booked and once
 * they were. A job or the CLI takes them and acknowledges them; this page shows
 * where that stands, and lets a person acknowledge one they booked by hand. The
 * part of the queue shown is in the URL, so that a link to the waiting invoices
 * survives a reload.
 */
export function HandoffPageContent({
  onStatusChange,
  status,
}: HandoffPageContentProps) {
  const { t } = useTranslation();
  const InvoiceIcon = dataModelIcons.invoice;

  function renderTab([tabStatus, labelKey]: [HandoffQueueStatus, string]) {
    return (
      <TabsTrigger key={tabStatus} value={tabStatus}>
        {t(labelKey)}
      </TabsTrigger>
    );
  }

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
      <Tabs
        className="mt-4 min-h-0 flex-1"
        onValueChange={(value) => {
          if (isQueueStatus(value)) {
            onStatusChange(value);
          }
        }}
        value={status}
      >
        <TabsList aria-label={t('Pages.Billing.Handoff.Tabs.label')}>
          {(
            Object.entries(TAB_LABEL_KEYS) as [HandoffQueueStatus, string][]
          ).map(renderTab)}
        </TabsList>
        <TabsContent className="flex min-h-0 flex-col" value={status}>
          <HandoffList status={status} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
