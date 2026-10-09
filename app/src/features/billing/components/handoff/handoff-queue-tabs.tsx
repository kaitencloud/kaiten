import { useTranslation } from 'react-i18next';
import { RouteTabs } from '@/functionals/route-tabs';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';

type QueueTabDefinition = {
  labelKey: string;
  /** What the tab adds to the handoff view: what waits is the bare path of the view. */
  search?: Record<string, string>;
};

// One tab to each status the API reads the queue in: a status it adds fails the
// type check until it has a tab.
const TABS = {
  PENDING: { labelKey: 'Pages.Billing.Handoff.Tabs.pending' },
  ACKNOWLEDGED: {
    labelKey: 'Pages.Billing.Handoff.Tabs.acknowledged',
    search: { queue: 'ACKNOWLEDGED' },
  },
} as const satisfies Record<HandoffQueueStatus, QueueTabDefinition>;

/**
 * The two parts of the queue, what waits and what was acknowledged, as links of the
 * handoff view told apart by its search. The control sits in the toolbar beside the
 * search, where the filters of a list are.
 */
export function HandoffQueueTabs() {
  const { t } = useTranslation();
  const tabs = (
    Object.entries(TABS) as [HandoffQueueStatus, QueueTabDefinition][]
  ).map(([status, { labelKey, search }]) => ({
    id: status,
    label: t(labelKey),
    search: { view: 'handoff', ...search },
    to: '/invoices',
  }));

  return <RouteTabs className="mt-0" listClassName="h-9" tabs={tabs} />;
}
