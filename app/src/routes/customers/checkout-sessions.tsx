import { createFileRoute, useRouter } from '@tanstack/react-router';
import { BillingNotFound, requireBillingCapability } from '@/domains/billing';
import {
  CheckoutSessionsPageContent,
  CheckoutSessionsRouteError,
  CheckoutSessionsRoutePending,
  checkoutSessionsQueryOptions,
  readCheckoutSessionsSearch,
  usePanelOpenedHere,
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
  // scope that reads them is told which one), under the title and the tabs of the section,
  // which still work; the wait for the list is drawn under them as well.
  errorComponent: CheckoutSessionsRouteError,
  pendingComponent: CheckoutSessionsRoutePending,
  // Shown in place of the screen where billing is not there, so that a link to it
  // explains why instead of failing.
  notFoundComponent: BillingNotFound,
  validateSearch: (search) => readCheckoutSessionsSearch(search),
  // The checkouts exist where GET /billing/capabilities says billing is on and this
  // release ships the public surface (`features.publicSurface`), the surface that starts
  // them. Where it does not, the guard throws a not-found that carries why, and nothing
  // else is requested; the same holds for a session without `read:billing`, which that
  // read needs. A session that holds `read:billing` and lacks the scope of the checkout
  // read still sends the list request: the API refuses it, and the page says so under the
  // tabs. The guard is not a check of the action.
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
  const router = useRouter();
  const search = Route.useSearch();
  // Closing a panel that was opened from this page goes back to the entry the page had, so
  // that Back leaves the list instead of opening the panel again.
  const openedHere = usePanelOpenedHere('session');

  return (
    <CheckoutSessionsPageContent
      onClose={() => {
        if (openedHere.current) {
          router.history.back();

          return;
        }
        void navigate({
          replace: true,
          search: (previous) => ({ ...previous, session: undefined }),
        });
      }}
      onOpen={(session) =>
        void navigate({ search: (previous) => ({ ...previous, session }) })
      }
      onStatusSeedDropped={() =>
        void navigate({
          replace: true,
          search: (previous) => ({ ...previous, status: undefined }),
        })
      }
      search={search}
    />
  );
}
