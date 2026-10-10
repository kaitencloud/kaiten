import { useTranslation } from 'react-i18next';
import { RouteTabs } from '@/functionals/route-tabs';
import { useHandoffViewAvailable } from '../../hooks';
import type { InvoicesView } from '../../schemas/invoices-search.schema';

type ViewDefinition = {
  labelKey: string;
  /** What the view adds to the path: every invoice is the bare path of the route. */
  search?: Record<string, string>;
};

// One tab to each view of the list: a view it adds fails the type check until it
// has a tab.
const VIEWS = {
  all: { labelKey: 'Pages.Billing.Invoices.Views.all' },
  handoff: {
    labelKey: 'Pages.Billing.Handoff.title',
    search: { view: 'handoff' },
  },
} as const satisfies Record<InvoicesView, ViewDefinition>;

/**
 * The control of the toolbar that moves between the views of the list of invoices:
 * every invoice, or the handoff queue. It is two links of one route, told apart by
 * its search, so the view survives a reload and the back button leaves it. It is
 * drawn only where the queue matters (see `useHandoffViewAvailable`): without it the
 * list is the list of invoices and nothing else.
 */
export function InvoicesViewSwitcher() {
  const { t } = useTranslation();
  const isAvailable = useHandoffViewAvailable();

  if (!isAvailable) {
    return null;
  }

  const tabs = (Object.entries(VIEWS) as [InvoicesView, ViewDefinition][]).map(
    ([view, { labelKey, search }]) => ({
      id: view,
      label: t(labelKey),
      search,
      to: '/invoices',
    }),
  );

  return <RouteTabs className="mt-0" listClassName="h-9" tabs={tabs} />;
}
