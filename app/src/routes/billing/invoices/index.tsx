import { createFileRoute } from '@tanstack/react-router';
import { BillingRouteError, invoicesQueryOptions } from '@/domains/billing';
import {
  InvoicesPageContent,
  readInvoiceListSeed,
  readInvoiceScope,
} from '@/features/billing';
import i18n from '@/lib/i18n/config';

// The URL holds the scope of the list, the customer or the instance whose invoices
// it lists, so that the links of an invoice and of a customer can lead to it. The
// API applies it; every filter is the page's, in the browser. A few of them can also
// be asked for by a link (held, overdue, one status, one handoff status), which only
// sets where they start, so that a screen that counts invoices can lead to them.
// Anything that does not read as a slug, or as one of those, is dropped.
export const Route = createFileRoute('/billing/invoices/')({
  component: InvoicesRoute,
  // The API's own words for why the invoices could not be read, around the
  // console that still works.
  errorComponent: BillingRouteError,
  validateSearch: (search) => ({
    ...readInvoiceScope(search),
    ...readInvoiceListSeed(search),
  }),
  // The router hands over what it validated merged with the rest of the URL: a
  // link of an older version still carries filters the page does not read, and the
  // API must not be asked for them. Only the scope is the API's.
  loaderDeps: ({ search }) => ({ scope: readInvoiceScope(search) }),
  // Loads every invoice of the scope, like the other list pages load theirs.
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(invoicesQueryOptions(deps.scope)),
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Billing.Invoices.title'),
  }),
});

function InvoicesRoute() {
  const navigate = Route.useNavigate();
  const scope = Route.useSearch({
    select: (search) => readInvoiceScope(search),
  });
  const seed = Route.useSearch({
    select: (search) => readInvoiceListSeed(search),
  });

  return (
    <InvoicesPageContent
      // A new scope keeps the filters the link opened the list on, so that taking
      // the scope off does not change what the list shows.
      onScopeChange={(next) =>
        void navigate({
          search: (previous) => ({ ...readInvoiceListSeed(previous), ...next }),
        })
      }
      scope={scope}
      seed={seed}
    />
  );
}
