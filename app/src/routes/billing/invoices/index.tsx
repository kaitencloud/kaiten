import { createFileRoute } from '@tanstack/react-router';
import {
  InvoicesPageContent,
  invoicesQueryOptions,
  readInvoiceFilters,
} from '@/features/billing';
import i18n from '@/lib/i18n/config';

// The filters are the API's and live in the URL: a list can be linked to, and
// reloading it restores them. Anything that does not read as a filter is dropped.
export const Route = createFileRoute('/billing/invoices/')({
  component: InvoicesRoute,
  validateSearch: (search) => readInvoiceFilters(search),
  loaderDeps: ({ search }) => ({ filters: search }),
  // Warms the list without failing the route: a refusal is shown by the list,
  // with the filters still in place and a way to ask again.
  loader: async ({ context, deps }) => {
    await context.queryClient.prefetchQuery(invoicesQueryOptions(deps.filters));
  },
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Billing.Invoices.title'),
  }),
});

function InvoicesRoute() {
  const navigate = Route.useNavigate();
  const filters = Route.useSearch();

  return (
    <InvoicesPageContent
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next })}
    />
  );
}
