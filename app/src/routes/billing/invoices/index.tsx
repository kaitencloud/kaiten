import { createFileRoute } from '@tanstack/react-router';
import { BillingRouteError, invoicesQueryOptions } from '@/domains/billing';
import { InvoicesPageContent, readInvoiceScope } from '@/features/billing';
import i18n from '@/lib/i18n/config';

// The URL holds the scope of the list, the customer or the instance whose invoices
// it lists, so that the links of an invoice and of a customer can lead to it. The
// API applies it; every other filter is the page's, in the browser. Anything that
// does not read as a slug is dropped.
export const Route = createFileRoute('/billing/invoices/')({
  component: InvoicesRoute,
  // The API's own words for why the invoices could not be read, around the
  // console that still works.
  errorComponent: BillingRouteError,
  validateSearch: (search) => readInvoiceScope(search),
  // The router hands over what it validated merged with the rest of the URL: a
  // link of an older version still carries the filters the page no longer reads,
  // and the API must not be asked for them.
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

  return (
    <InvoicesPageContent
      onScopeChange={(next) => void navigate({ search: next })}
      scope={scope}
    />
  );
}
