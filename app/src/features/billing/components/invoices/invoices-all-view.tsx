import { useSuspenseQuery } from '@tanstack/react-query';
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
import { InvoicesList } from './invoices-list';

type InvoicesAllViewProps = {
  /** Writes the scope to the URL, which the page follows. */
  onScopeChange: (scope: InvoiceScope) => void;
  /** The customer or the instance the URL scopes the list to. */
  scope: InvoiceScope;
  /** The filters the URL opens the list on; none for the bare path. */
  seed: InvoiceListSeed;
};

/**
 * Every invoice of the scope, across the customers and instances of the
 * organization: what was composed at each boundary, in what status, and where it
 * stands in the handoff queue. The route loads every invoice of the scope, like the
 * other list pages load theirs, and the list filters, sorts and pages them.
 */
export function InvoicesAllView({
  onScopeChange,
  scope,
  seed,
}: InvoicesAllViewProps) {
  const { data } = useSuspenseQuery(invoicesQueryOptions(scope));
  const stripe = useBillingProvider('STRIPE');
  const canExport = useCanPerform('invoices.export');
  // With NoOp alone, who collects an invoice is never a question. Once Stripe
  // collects any, the column and the filter say which, and they stay for the
  // invoices of a Stripe that has been disconnected since.
  const showProvider =
    stripe.isConnected ||
    data.items.some((invoice) => invoice.providerKind === 'STRIPE');

  // A link to another seed starts the filters over: they are the browser's, and a
  // seed is only where they start.
  return (
    <InvoicesList
      canExport={canExport}
      initialFilterValues={toInitialFilterValues(seed)}
      invoices={data.items}
      key={JSON.stringify(seed)}
      onScopeChange={onScopeChange}
      scope={scope}
      showProvider={showProvider}
    />
  );
}
