import { useTranslation } from 'react-i18next';
import { RouteTabs } from '@/functionals/route-tabs';
import { useHandoffViewAvailable } from '../../hooks';
import type { InvoiceScope } from '../../schemas/invoice-scope.schema';
import {
  INVOICES_VIEWS,
  type InvoicesView,
  isHandoffView,
} from '../../schemas/invoices-search.schema';
import type { InvoicesViewCounts } from '../../utils/invoice-views';

const LABEL_KEYS = {
  acknowledged: 'Pages.Billing.Invoices.Views.acknowledged',
  all: 'Pages.Billing.Invoices.Views.all',
  held: 'Pages.Billing.Invoices.Views.held',
  overdue: 'Pages.Billing.Invoices.Views.overdue',
  waiting: 'Pages.Billing.Invoices.Views.waiting',
} as const satisfies Record<InvoicesView, string>;

type InvoicesViewTabsProps = {
  /** How many invoices each view holds, from the list the page loaded. */
  counts: InvoicesViewCounts;
  /** The customer or the instance the list is scoped to, which the views of invoices keep. */
  scope: InvoiceScope;
};

// The search a tab leads to: every invoice is the bare path, any other view is
// `?view=`. The views of invoices keep the scope the API applies; the queue is the
// organization's, so its views drop it.
function searchOf(view: InvoicesView, scope: InvoiceScope) {
  const kept = Object.fromEntries(
    Object.entries(scope).filter(([, slug]) => Boolean(slug)),
  ) as Record<string, string>;

  if (isHandoffView(view)) {
    return { view };
  }

  return view === 'all' ? kept : { ...kept, view };
}

/**
 * The row of status views above the toolbar of the invoices, each with its count:
 * All, Overdue, Held and, where the queue matters (see `useHandoffViewAvailable`),
 * Waiting for your ERP and Acknowledged. They are links of one route told apart by
 * its search, so the view survives a reload and the back button leaves it; the row
 * is the one the customers and their instances have.
 */
export function InvoicesViewTabs({ counts, scope }: InvoicesViewTabsProps) {
  const { t } = useTranslation();
  const isHandoffAvailable = useHandoffViewAvailable();

  const tabs = INVOICES_VIEWS.filter(
    (view) => isHandoffAvailable || !isHandoffView(view),
  ).map((view) => ({
    count: counts[view],
    id: view,
    label: t(LABEL_KEYS[view]),
    search: searchOf(view, scope),
    to: '/invoices',
  }));

  // Five tabs with their counts are wider than a phone: the row scrolls by itself
  // instead of widening the page.
  return <RouteTabs className="max-w-full overflow-x-auto" tabs={tabs} />;
}
