import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  invoicesQueryOptions,
  useBillingProvider,
  useCanPerform,
} from '@/domains/billing';
import {
  type InvoiceListSeed,
  toInitialFilterValues,
} from '../../schemas/invoice-list-seed.schema';
import type { InvoiceScope } from '../../schemas/invoice-scope.schema';
import type {
  HandoffView,
  InvoicesView,
} from '../../schemas/invoices-search.schema';
import { invoicesOfView } from '../../utils/invoice-views';
import { InvoicesList } from './invoices-list';

type InvoicesAllViewProps = {
  /** Writes the scope to the URL, which the page follows. */
  onScopeChange: (scope: InvoiceScope) => void;
  /** The customer or the instance the URL scopes the list to. */
  scope: InvoiceScope;
  /** The filters the URL opens the list on; none for the bare path. */
  seed: InvoiceListSeed;
  /** Which part of the list the tab asks for: every invoice, the overdue ones or the held ones. */
  view: Exclude<InvoicesView, HandoffView>;
};

/**
 * The invoices of the scope that the view keeps, across the customers and instances of
 * the organization: what was composed at each boundary, in what status, and where it
 * stands in the handoff queue. The route loads every invoice of the scope, like the
 * other list pages load theirs; the view narrows them with its own test (the one of its
 * filter), and the list filters, sorts and pages what is left.
 */
export function InvoicesAllView({
  onScopeChange,
  scope,
  seed,
  view,
}: InvoicesAllViewProps) {
  const { data } = useSuspenseQuery(invoicesQueryOptions(scope));
  const stripe = useBillingProvider('STRIPE');
  const canExport = useCanPerform('invoices.export');
  // With NoOp alone, who collects an invoice is never a question. Once Stripe
  // collects any, the column and the filter say which, and they stay for the
  // invoices of a Stripe that has been disconnected since.
  const invoices = useMemo(
    () => invoicesOfView(data.items, view),
    [data.items, view],
  );
  const showProvider =
    stripe.isConnected ||
    data.items.some((invoice) => invoice.providerKind === 'STRIPE');

  // A link to another seed, or another view, starts the filters over: they are the
  // browser's, and a seed is only where they start.
  return (
    <InvoicesList
      canExport={canExport}
      initialFilterValues={toInitialFilterValues(seed)}
      invoices={invoices}
      key={`${view}:${JSON.stringify(seed)}`}
      onScopeChange={onScopeChange}
      scope={scope}
      showProvider={showProvider}
      view={view}
    />
  );
}
