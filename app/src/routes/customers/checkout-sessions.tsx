import { createFileRoute } from '@tanstack/react-router';
import {
  BillingNotFound,
  BillingRouteError,
  requireBillingCapability,
} from '@/domains/billing';
import {
  CheckoutSessionsPageContent,
  checkoutSessionsQueryOptions,
  readCheckoutSessionsSearch,
} from '@/features/customers';
import i18n from '@/lib/i18n/config';

// A leaf on purpose, with nothing under it: a static segment wins over the `$customerSlug`
// one, so this path is the list of checkouts even for a customer whose slug is
// `checkout-sessions`. Every path below it (`/customers/checkout-sessions/instances/new`)
// has no match here and still falls to that customer's routes. The checkout a panel shows
// is `?session=`, not a segment, for the same reason.
export const Route = createFileRoute('/customers/checkout-sessions')({
  component: CheckoutSessionsRoute,
  // The API's own words for why the checkouts could not be read (a session without the
  // scope that reads them is told which one), around the console that still works.
  errorComponent: BillingRouteError,
  // Shown in place of the screen where billing is not there, so that a link to it
  // explains why instead of failing.
  notFoundComponent: BillingNotFound,
  validateSearch: (search) => readCheckoutSessionsSearch(search),
  // The checkouts exist where GET /billing/capabilities says billing is on and this
  // release ships the public surface (`features.publicSurface`), the surface that starts
  // them. Where it does not, the guard throws a not-found that carries why, and nothing
  // else is requested. What a session may do is its scopes (`read:billing`), which the API
  // checks and the tab of the section follows.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient, 'publicSurface');

    return {
      getTitle: () => i18n.t('Pages.Customers.CheckoutSessions.title'),
    };
  },
  // Loads every checkout, like the other list pages load theirs.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(checkoutSessionsQueryOptions()),
});

function CheckoutSessionsRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  return (
    <CheckoutSessionsPageContent
      onClose={() =>
        void navigate({
          search: (previous) => ({ ...previous, session: undefined }),
        })
      }
      onOpen={(session) =>
        void navigate({ search: (previous) => ({ ...previous, session }) })
      }
      search={search}
    />
  );
}
