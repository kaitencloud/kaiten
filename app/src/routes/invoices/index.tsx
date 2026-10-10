import { createFileRoute } from '@tanstack/react-router';
import { BillingRouteError, invoicesQueryOptions } from '@/domains/billing';
import {
  handoffQueryOptions,
  InvoicesPageContent,
  readInvoiceListSeed,
  readInvoicesLoaderDeps,
  readInvoicesSearch,
} from '@/features/billing';
import i18n from '@/lib/i18n/config';

// The URL holds the view of the list, the row of status tabs above its toolbar:
// every invoice, which is the bare path, or `?view=overdue`, `?view=held`,
// `?view=waiting` and `?view=acknowledged`, the last two being the handoff queue. In
// the views of invoices it also holds the scope of the list, the customer or the
// instance whose invoices it lists, so that the links of an invoice and of a customer
// can lead to it. The API applies it; every filter is the page's, in the browser. A
// few of them can also be asked for by a link (one status, one handoff status), which
// only sets where they start, so that a screen that counts invoices can lead to them.
// Anything that does not read as a slug, or as one of those, is dropped.
export const Route = createFileRoute('/invoices/')({
  component: InvoicesRoute,
  // The API's own words for why the invoices could not be read, around the
  // console that still works.
  errorComponent: BillingRouteError,
  validateSearch: (search) => readInvoicesSearch(search),
  // The router hands over what it validated merged with the rest of the URL: a
  // link of an older version still carries filters the page does not read, and the
  // API must not be asked for them. Only the scope of the invoices and the part of
  // the queue are the API's.
  loaderDeps: ({ search }) => readInvoicesLoaderDeps(search),
  // Each view loads what it shows. The views of invoices load every invoice of the
  // scope, like the other list pages load theirs. The views of the queue load their
  // part of the queue; the invoices there only count the tabs, so they are asked for
  // without being waited for and without being able to fail the route: a session that
  // may read the queue but not the invoices still gets the queue, with no counts.
  loader: async ({ context, deps }) => {
    const invoices = invoicesQueryOptions(deps.scope);

    if (!deps.queue) {
      await context.queryClient.ensureQueryData(invoices);

      return;
    }

    void context.queryClient.prefetchQuery(invoices);
    await context.queryClient.ensureQueryData(handoffQueryOptions(deps.queue));
  },
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Billing.Invoices.title'),
  }),
});

function InvoicesRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch({ select: readInvoicesSearch });

  return (
    <InvoicesPageContent
      // A new scope keeps the filters the link opened the list on, so that taking
      // the scope off does not change what the list shows.
      onScopeChange={(next) =>
        void navigate({
          search: (previous) => ({ ...readInvoiceListSeed(previous), ...next }),
        })
      }
      search={search}
    />
  );
}
